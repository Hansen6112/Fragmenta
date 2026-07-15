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
    title: "The Eternal Archive",
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    type: "gate",
    danger: 1,
    services: ["rest", "shop", "guild"],
    description:
      "While other cities preserve the Empire through steel or commerce, Apollyon preserves it through memory. Home to the renowned Guild Historia, the city safeguards the written history of Sanguivorum and countless civilizations that came before it. Historians, archaeologists, scribes, cartographers, librarians, and relic hunters all pass through its gates. Here, every artifact has a story, every ruin has a record, and every life is worthy of remembrance.",
    connections: [
      { to: "arethon", days: 2, mode: "road" },
      { to: "zuevaron", days: 2, mode: "road" },
      { to: "vulcaron", days: 3, mode: "road" },
      { to: "minervon", days: 3, mode: "road" },
      { to: "daedaron", days: 3, mode: "road" },
    ],
    // Apollyon's real district layout, built quarter by quarter (same
    // workflow as Arethon, Zuevaron, Aphroneth, Tritonath, Vulcaron,
    // Daedaron, Minervon, Silvanor, Victorath, and Marsatum) — the Civic
    // Quarter (The Archivist's Forum) is the first. Every place carries a
    // `district` tag for grouping in cmdLook/cmdPlaces; the Archivist's
    // Forum itself is the district's own walkable hub, so it doesn't need
    // one. Apollyon's prior generic 3-place stub (formerly reused as
    // scratch space by the engine-mechanism tests) has been fully
    // replaced — those tests (drive_sublocations.js, drive_areatypes.js,
    // drive_shop.js, drive_arethon_engine.js) were migrated to Sahurim
    // instead. Prior danger level (1), services (rest, shop, guild), and
    // road connections are preserved; terrain stays "plains". Patron
    // deity Mortasha.
    sublocations: {
      archivistsForum: {
        name: "The Archivist's Forum",
        type: "street",
        district: "Civic Quarter (The Archivist's Forum)",
        description:
          "The administrative center where history itself is protected by law.",
      },
      chronicleGate: {
        name: "The Chronicle Gate",
        type: "gate",
        district: "Civic Quarter (The Archivist's Forum)",
        description:
          "The principal entrance to Apollyon, adorned with statues depicting the great ages of Fragmenta.",
      },
      hallOfRecords: {
        name: "Hall of Records",
        type: "landmark",
        district: "Civic Quarter (The Archivist's Forum)",
        description:
          "Seat of Apollyon's Ascendus senator and administrative headquarters for the city's civic archives.",
      },
      chronicleSquare: {
        name: "Chronicle Square",
        type: "street",
        district: "Civic Quarter (The Archivist's Forum)",
        description:
          "A quiet public plaza where historians unveil discoveries, scholars lecture, and civic ceremonies commemorate the past.",
      },
      historiansLedger: {
        name: "The Historian's Ledger",
        type: "board",
        district: "Civic Quarter (The Archivist's Forum)",
        description:
          "Expeditions, archaeological contracts, relic recoveries, research commissions, and historical investigations are posted here.",
      },
      scholarsQuarter: {
        name: "Scholar's Quarter",
        type: "residential",
        district: "Civic Quarter (The Archivist's Forum)",
        description:
          "Home to scribes, professors, archivists, and generations of historians.",
      },
      civicRegistry: {
        name: "Civic Registry",
        type: "landmark",
        district: "Civic Quarter (The Archivist's Forum)",
        description:
          "Maintains birth records, census rolls, property deeds, and official imperial documents.",
      },
      // ------------------------------------------------ COMMERCIAL QUARTER
      antiquarianMarket: {
        name: "Antiquarian Market",
        type: "street",
        district: "Commercial Quarter (Antiquarian Market)",
        description:
          "Every merchant specializes in preserving, restoring, or discovering history.",
      },
      theAntiquary: {
        name: "The Antiquary",
        type: "market",
        district: "Commercial Quarter (Antiquarian Market)",
        description:
          "Stocks expedition gear, journals, inks, parchment, surveying tools, and scholarly supplies.",
      },
      relicForge: {
        name: "Relic Forge",
        type: "shop",
        district: "Commercial Quarter (Antiquarian Market)",
        shopCategory: "weapons",
        description:
          "Produces precision excavation tools, restoration implements, ceremonial weapons, and replica artifacts.",
      },
      curatorsArmory: {
        name: "Curator's Armory",
        type: "shop",
        district: "Commercial Quarter (Antiquarian Market)",
        shopCategory: "armor",
        description:
          "Crafts equipment designed for archaeologists, explorers, and relic hunters venturing into ancient ruins.",
      },
      preservationLaboratory: {
        name: "Preservation Laboratory",
        type: "shop",
        district: "Commercial Quarter (Antiquarian Market)",
        shopCategory: "potions",
        description:
          "Produces preservation oils, restoration chemicals, inks, adhesives, and alchemical compounds for artifact conservation.",
      },
      expeditionStables: {
        name: "Expedition Stables",
        type: "landmark",
        district: "Commercial Quarter (Antiquarian Market)",
        description:
          "Maintains mounts used by archaeological expeditions and scholarly caravans.",
      },
      dustAndQuill: {
        name: "The Dust & Quill",
        type: "inn",
        district: "Commercial Quarter (Antiquarian Market)",
        description:
          "A favorite gathering place for explorers returning with discoveries from across Fragmenta.",
      },
      imperialDepository: {
        name: "Imperial Depository",
        type: "landmark",
        district: "Commercial Quarter (Antiquarian Market)",
        description:
          "Provides secure vaults for wealthy collectors, museums, and expedition funding.",
      },
      guildExchange: {
        name: "Guild Exchange",
        type: "guildhall",
        district: "Commercial Quarter (Antiquarian Market)",
        description:
          "Coordinates research expeditions and artifact acquisitions throughout the continent.",
      },
      // ------------------------------------------------- MILITARY QUARTER
      // Source names both the district hub and its central fortress "The
      // Archive Bastion" — merged into one sublocation, same pattern as
      // Sea Bastion/Great Foundry/Engine Bastion/Command Citadel/Ranger
      // Citadel/Crown Citadel in earlier cities.
      archiveBastion: {
        name: "The Archive Bastion",
        type: "barracks",
        district: "Military Quarter (The Archive Bastion)",
        description:
          "Knowledge must be defended as fiercely as any fortress — the fortress protecting Guild Historia and the city's irreplaceable collections.",
      },
      hallOfCustodians: {
        name: "Hall of Custodians",
        type: "landmark",
        district: "Military Quarter (The Archive Bastion)",
        description:
          "Headquarters of the elite guardians assigned to protect Apollyon's archives.",
      },
      custodianBarracks: {
        name: "Custodian Barracks",
        type: "barracks",
        district: "Military Quarter (The Archive Bastion)",
        description:
          "Housing for soldiers specially trained in artifact protection and archive defense.",
      },
      preservationGrounds: {
        name: "Preservation Grounds",
        type: "barracks",
        district: "Military Quarter (The Archive Bastion)",
        description:
          "Custodians train in urban defense, artifact recovery, and protection of irreplaceable relics.",
      },
      archiveArsenal: {
        name: "Archive Arsenal",
        type: "landmark",
        district: "Military Quarter (The Archive Bastion)",
        description:
          "Stores weapons and equipment dedicated to defending the city's priceless collections.",
      },
      expeditionCommand: {
        name: "Expedition Command",
        type: "landmark",
        district: "Military Quarter (The Archive Bastion)",
        description:
          "Coordinates security for archaeological expeditions.",
      },
      houseOfRestoration: {
        name: "House of Restoration",
        type: "healer",
        district: "Military Quarter (The Archive Bastion)",
        description:
          "Treats explorers, soldiers, and scholars injured during expeditions.",
      },
      sentinelArchiveTower: {
        name: "Sentinel Archive Tower",
        type: "landmark",
        district: "Military Quarter (The Archive Bastion)",
        description:
          "An observation tower overlooking both the city and the surrounding ruins.",
      },
      // ------------------------------------------------- RELIGIOUS QUARTER
      sacredPrecinct: {
        name: "The Sacred Precinct",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "The faithful of Mortasha believe that death is not oblivion, but remembrance. Every life leaves behind a story, and preserving those stories is among the highest forms of devotion.",
      },
      grandTempleOfMortasha: {
        name: "The Grand Temple of Mortasha",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Mortasha"],
        description:
          "The greatest sanctuary dedicated to Mortasha in Sanguivorum. Families preserve ancestral records here, while historians honor those whose lives shaped the Empire.",
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
          "Welcomes pilgrims, mourners, scholars, and travelers.",
      },
      houseOfFaithful: {
        name: "House of the Faithful",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Residence of Apollyon's clergy and caretakers of sacred memorials.",
      },
      gardenOfRemembrance: {
        name: "Garden of Remembrance",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Mortasha"],
        description:
          "A tranquil sanctuary where engraved stones preserve the names of generations long passed.",
      },
      sacredArchives: {
        name: "Sacred Archives",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Maintains sacred texts, genealogies, funeral records, and centuries of ecclesiastical history.",
      },
      // ----------------------------------------------------- ARCANE QUARTER
      // Source lists "Guild Historia" as both this quarter's hub AND,
      // later, as a standalone entry under "City Landmarks" — the same
      // flagship-building-shares-the-quarter-name pattern seen in
      // Minervon's School of Manipulum Eruditetus. Merged into a single
      // sublocation here (combining both blurbs) so the upcoming City
      // Landmarks batch won't recreate an identically-named, unreachable
      // duplicate.
      guildHistoria: {
        name: "Guild Historia",
        type: "guildhall",
        district: "Arcane Quarter (Guild Historia)",
        description:
          "The greatest historical institution in Fragmenta, dedicated to preserving knowledge before it is lost forever — the most comprehensive historical institution in Fragmenta, preserving the collective memory of civilizations across the continent.",
      },
      grandHallOfHistoria: {
        name: "Grand Hall of Historia",
        type: "landmark",
        district: "Arcane Quarter (Guild Historia)",
        description:
          "The central headquarters of Guild Historia and the largest historical archive in the Empire.",
      },
      registryOfExpeditions: {
        name: "Registry of Expeditions",
        type: "landmark",
        district: "Arcane Quarter (Guild Historia)",
        description:
          "Coordinates archaeological expeditions, relic recovery teams, and historical surveys.",
      },
      chamberOfRestoration: {
        name: "Chamber of Restoration",
        type: "landmark",
        district: "Arcane Quarter (Guild Historia)",
        description:
          "Studies magical preservation, artifact restoration, and ancient enchantments.",
      },
      theGrandRepository: {
        name: "The Grand Repository",
        type: "landmark",
        district: "Arcane Quarter (Guild Historia)",
        description:
          "An immense library containing historical records, maps, journals, recovered relics, and ancient manuscripts.",
      },
      scholarsResidence: {
        name: "Scholar's Residence",
        type: "residential",
        district: "Arcane Quarter (Guild Historia)",
        description:
          "Housing for historians, librarians, archaeologists, and visiting researchers.",
      },
      archiveCircle: {
        name: "Archive Circle",
        type: "landmark",
        district: "Arcane Quarter (Guild Historia)",
        description:
          "Reserved for sanctioned magical transportation of priceless historical materials.",
      },
      // ------------------------------------------------------ TRADE QUARTER
      expeditionQuarter: {
        name: "The Expedition Quarter",
        type: "street",
        district: "Trade Quarter (The Expedition Quarter)",
        description:
          "The logistical center supporting historical expeditions throughout Fragmenta.",
      },
      explorersGate: {
        name: "Explorer's Gate",
        type: "gate",
        district: "Trade Quarter (The Expedition Quarter)",
        description:
          "The departure point for archaeological caravans and scholarly expeditions.",
      },
      imperialCustoms: {
        name: "Imperial Customs",
        type: "landmark",
        district: "Trade Quarter (The Expedition Quarter)",
        description:
          "Records relics and recovered artifacts entering the city.",
      },
      preservationVaults: {
        name: "Preservation Vaults",
        type: "landmark",
        district: "Trade Quarter (The Expedition Quarter)",
        description:
          "Climate-controlled storage for newly recovered historical treasures.",
      },
      expeditionHall: {
        name: "Expedition Hall",
        type: "landmark",
        district: "Trade Quarter (The Expedition Quarter)",
        description:
          "Organizes exploration teams, supply caravans, and research missions.",
      },
      surveyorsOffice: {
        name: "Surveyor's Office",
        type: "landmark",
        district: "Trade Quarter (The Expedition Quarter)",
        description:
          "Maintains official maps and records of newly explored regions.",
      },
      caravanDepot: {
        name: "Caravan Depot",
        type: "landmark",
        district: "Trade Quarter (The Expedition Quarter)",
        description:
          "Supplies expeditions before they depart into the unknown.",
      },
      // ----------------------------------------------------- ARTISAN QUARTER
      restorationWard: {
        name: "Restoration Ward",
        type: "street",
        district: "Artisan Quarter (Restoration Ward)",
        description:
          "Master craftsmen dedicated to preserving the past.",
      },
      // Described as restoring/reproducing "ceremonial weapons" and
      // "historical arms" for study and display — same ceremonial framing
      // as Minervon's Officer's Forge, which stayed flavor-only rather
      // than getting a real weapons shopCategory (unlike Silvanor's
      // Heartwood Forge, Victorath's Victor's Forge, and Marsatum's
      // Sentinel Forge, which explicitly described functional combat gear).
      legacyForge: {
        name: "Legacy Forge",
        type: "landmark",
        district: "Artisan Quarter (Restoration Ward)",
        description:
          "Restores ceremonial weapons and reproduces historical arms using traditional techniques.",
      },
      stoneConservatory: {
        name: "Stone Conservatory",
        type: "landmark",
        district: "Artisan Quarter (Restoration Ward)",
        description:
          "Repairs monuments, ruins, and historical architecture.",
      },
      archivistTailors: {
        name: "Archivist Tailors",
        type: "landmark",
        district: "Artisan Quarter (Restoration Ward)",
        description:
          "Produces archival cloth, protective wrappings, and expedition garments.",
      },
      relicJewelers: {
        name: "Relic Jewelers",
        type: "shop",
        district: "Artisan Quarter (Restoration Ward)",
        shopCategory: "jewelry",
        description:
          "Restores crowns, jewelry, seals, and precious artifacts recovered from ancient civilizations.",
      },
      conservatorsWorkshop: {
        name: "Conservator's Workshop",
        type: "landmark",
        district: "Artisan Quarter (Restoration Ward)",
        description:
          "A collaborative workshop where damaged relics are restored for study and display.",
      },
      scribesWorkshop: {
        name: "Scribe's Workshop",
        type: "landmark",
        district: "Artisan Quarter (Restoration Ward)",
        description:
          "Produces parchment, inks, maps, journals, illuminated manuscripts, and calligraphy supplies.",
      },
      // --------------------------------------------------- NOBLE QUARTER
      scholarsHeights: {
        name: "Scholar's Heights",
        type: "residential",
        district: "Noble Quarter (Scholar's Heights)",
        description:
          "Home to Guild Historia's senior scholars and Apollyon's civic leaders.",
      },
      houseOfGrandArchivist: {
        name: "House of the Grand Archivist",
        type: "landmark",
        district: "Noble Quarter (Scholar's Heights)",
        description:
          "Residence of Apollyon's Ascendus senator.",
      },
      historiansEstates: {
        name: "Historian's Estates",
        type: "residential",
        district: "Noble Quarter (Scholar's Heights)",
        description:
          "Homes of renowned scholars, collectors, and Guild Historia masters.",
      },
      embassyHall: {
        name: "Embassy Hall",
        type: "residential",
        district: "Noble Quarter (Scholar's Heights)",
        description:
          "Hosts foreign scholars and diplomatic representatives seeking access to the archives.",
      },
      memorialGardens: {
        name: "Memorial Gardens",
        type: "landmark",
        district: "Noble Quarter (Scholar's Heights)",
        description:
          "A peaceful garden where monuments commemorate the greatest historians and explorers of Fragmenta.",
      },
      hallOfLegacy: {
        name: "Hall of Legacy",
        type: "landmark",
        district: "Noble Quarter (Scholar's Heights)",
        description:
          "Recognizes extraordinary contributions to scholarship, preservation, and historical discovery.",
      },
      archivistsCircle: {
        name: "The Archivist's Circle",
        type: "landmark",
        district: "Noble Quarter (Scholar's Heights)",
        description:
          "A private gathering place where historians, archaeologists, and philosophers debate the mysteries of the past.",
      },
      // ------------------------------------------------ CITY LANDMARKS
      // Source repeats "Guild Historia" here — already merged into the
      // Arcane Quarter hub, so it's not recreated as a duplicate. Only
      // the other three City Landmarks entries are new.
      grandArchive: {
        name: "The Grand Archive",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A colossal library containing millions of scrolls, codices, maps, and records spanning thousands of years.",
      },
      hallOfAges: {
        name: "The Hall of Ages",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A museum displaying the Empire's most significant relics, artifacts, and archaeological discoveries.",
      },
      memoryObelisk: {
        name: "The Memory Obelisk",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A towering monument engraved with the names of individuals whose contributions forever changed Fragmenta.",
      },
      // ------------------------------------------------- EXPLORATION LOCATIONS
      // Standalone and unsafe, same structure as the other cities' batches
      // — the sealed vaults, forgotten catacombs, and ruined repository
      // get "ruin" for skeleton/zombie/animated-armor encounters alongside
      // the bandit/hired-blade "urban" pool. The Excavation Fields,
      // Explorer's Encampment, and The Scholar's Overlook are all
      // still-active, maintained sites, so they stay "urban" only.
      sealedVaults: {
        name: "The Sealed Vaults",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "Ancient subterranean repositories containing relics too dangerous or mysterious for public study.",
      },
      forgottenCatacombs: {
        name: "The Forgotten Catacombs",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "Burial chambers beneath the city holding generations of history — and secrets never meant to be rediscovered.",
      },
      excavationFields: {
        name: "The Excavation Fields",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "An active archaeological site where new discoveries are made throughout the year.",
      },
      lostRepository: {
        name: "The Lost Repository",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "The ruins of an archive that predates the founding of Sanguivorum, its surviving records written in forgotten tongues.",
      },
      explorersEncampment: {
        name: "Explorer's Encampment",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "The departure point for expeditions into ancient ruins, lost temples, and forgotten civilizations.",
      },
      scholarsOverlook: {
        name: "The Scholar's Overlook",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A quiet terrace overlooking Apollyon, where historians gather to reflect on the enduring legacy of the Empire and the countless stories still waiting to be uncovered.",
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
      "Built around an ancient lighthouse that predates the Great Mage War, the Kabal, and even the oldest known civilizations, Tritonath exists for a single purpose: to deny passage through the Empire's most strategically important fjord. The city is smaller than Aphroneth or Nepturon, but every cliff, wall, and tower has been built with defense in mind. The fjord itself forms a natural kill zone where enemy fleets are trapped beneath the guns, ballistae, and mages stationed high above. The ancient lighthouse remains one of Fragmenta's greatest mysteries — it still burns without fuel, keeper, or known mechanism.",
    connections: [
      { to: "aphroneth", days: 4, mode: "road", desc: "south along the fjord coast" },
      { to: "nepturon", days: 2, mode: "road", desc: "along the fjord" },
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
    title: "The Living Canopy",
    nation: "sanguivorum",
    terrain: "forest",
    isCity: true,
    danger: 2,
    services: ["rest"],
    description:
      "Silvanor is unlike any other city in Sanguivorum. Rather than conquering the ancient forest, its founders learned to build within it. Great halls are grown instead of quarried, bridges weave through colossal branches, and homes rest among living trunks that have stood for centuries. It is the cultural heart of Sanguivorum's Dragonborn population and the Empire's foremost authority on forestry, conservation, and wilderness survival. Here, civilization exists not in opposition to nature, but in partnership with it.",
    connections: [
      { to: "vulcaron", days: 2, mode: "road" },
      { to: "nepturon", days: 3, mode: "road" },
    ],
    // Silvanor's real district layout, built quarter by quarter (same
    // workflow as Arethon, Zuevaron, Aphroneth, Tritonath, Vulcaron,
    // Daedaron, and Minervon) — the Civic Quarter (The Canopy Forum) is
    // the first. Every place carries a `district` tag for grouping in
    // cmdLook/cmdPlaces; the Canopy Forum itself is the district's own
    // walkable hub, so it doesn't need one. Silvanor is an existing stub
    // (exact name match, no rename needed, same as Vulcaron and
    // Minervon) — its prior terrain was "mountain", but the new lore
    // describes an ancient-forest tree-city, so terrain is corrected to
    // "forest" (its old one-line stub description even hinted at this:
    // "known mostly for the trees that cluster oddly close around it").
    // Services and road connections to Vulcaron/Netturon are preserved.
    sublocations: {
      canopyForum: {
        name: "The Canopy Forum",
        type: "street",
        district: "Civic Quarter (The Canopy Forum)",
        description:
          "Government conducted beneath the shade of ancient trees.",
      },
      greenwoodGate: {
        name: "The Greenwood Gate",
        type: "gate",
        district: "Civic Quarter (The Canopy Forum)",
        description:
          "The principal entrance into Silvanor, formed by two colossal living oaks whose branches have naturally intertwined overhead.",
      },
      hallOfLivingBoughs: {
        name: "Hall of Living Boughs",
        type: "landmark",
        district: "Civic Quarter (The Canopy Forum)",
        description:
          "The seat of Silvanor's Ascendus senator, constructed entirely from living wood shaped over generations.",
      },
      verdantSquare: {
        name: "Verdant Square",
        type: "street",
        district: "Civic Quarter (The Canopy Forum)",
        description:
          "A circular gathering place where festivals, public announcements, and seasonal celebrations are held beneath the forest canopy.",
      },
      rangersLedger: {
        name: "The Ranger's Ledger",
        type: "board",
        district: "Civic Quarter (The Canopy Forum)",
        description:
          "Requests for monster hunts, forest patrols, botanical expeditions, and conservation efforts are posted here.",
      },
      canopyWard: {
        name: "Canopy Ward",
        type: "residential",
        district: "Civic Quarter (The Canopy Forum)",
        description:
          "Homes woven into the trunks and branches of ancient trees.",
      },
      forestVigilisHeadquarters: {
        name: "Forest Vigilis Headquarters",
        type: "barracks",
        district: "Civic Quarter (The Canopy Forum)",
        description:
          "Maintains order while protecting both the city and the surrounding forest.",
      },
      // ------------------------------------------------ COMMERCIAL QUARTER
      greenMarket: {
        name: "The Green Market",
        type: "street",
        district: "Commercial Quarter (The Green Market)",
        description:
          "Every merchant reflects the bounty of the forest.",
      },
      woodlandExchange: {
        name: "The Woodland Exchange",
        type: "market",
        district: "Commercial Quarter (The Green Market)",
        description:
          "Stocks camping supplies, travel gear, herbal remedies, and everyday provisions.",
      },
      ironrootForge: {
        name: "Ironroot Forge",
        type: "shop",
        district: "Commercial Quarter (The Green Market)",
        shopCategory: "weapons",
        description:
          "Produces lightweight weapons, hunting spears, axes, and practical tools designed for woodland travel.",
      },
      barkshieldArmory: {
        name: "Barkshield Armory",
        type: "shop",
        district: "Commercial Quarter (The Green Market)",
        shopCategory: "armor",
        description:
          "Specializes in light armor, leather equipment, and ranger gear emphasizing mobility.",
      },
      verdantRemedies: {
        name: "Verdant Remedies",
        type: "shop",
        district: "Commercial Quarter (The Green Market)",
        shopCategory: "potions",
        description:
          "Produces herbal medicines, natural poisons, antidotes, and botanical extracts gathered from the surrounding forest.",
      },
      forestStables: {
        name: "Forest Stables",
        type: "landmark",
        district: "Commercial Quarter (The Green Market)",
        description:
          "Maintains horses and pack animals trained to travel woodland paths.",
      },
      hollowOak: {
        name: "The Hollow Oak",
        type: "inn",
        district: "Commercial Quarter (The Green Market)",
        description:
          "A welcoming inn built within the hollow trunk of a massive living tree.",
      },
      evergreenReserve: {
        name: "Evergreen Reserve",
        type: "landmark",
        district: "Commercial Quarter (The Green Market)",
        description:
          "Supports foresters, hunters, merchants, and local craftsmen.",
      },
      forestersGuild: {
        name: "Forester's Guild",
        type: "guildhall",
        district: "Commercial Quarter (The Green Market)",
        description:
          "Coordinates sustainable harvesting and woodland commerce.",
      },
      // ------------------------------------------------- MILITARY QUARTER
      // Source names both the district hub and its central defense
      // headquarters "The Ranger Citadel" — merged into one sublocation,
      // same as the other cities' Sea Bastion/Great Foundry/Engine Bastion/
      // Command Citadel.
      rangerCitadel: {
        name: "The Ranger Citadel",
        type: "barracks",
        district: "Military Quarter (The Ranger Citadel)",
        description:
          "The Empire's foremost center for woodland warfare — headquarters of Silvanor's forest defenders and frontier rangers.",
      },
      hallOfWardens: {
        name: "Hall of Wardens",
        type: "landmark",
        district: "Military Quarter (The Ranger Citadel)",
        description:
          "Coordinates patrols throughout the surrounding wilderness.",
      },
      rangerBarracks: {
        name: "Ranger Barracks",
        type: "barracks",
        district: "Military Quarter (The Ranger Citadel)",
        description:
          "Housing for scouts, beast hunters, and woodland defenders.",
      },
      woodlandTrainingGrounds: {
        name: "Woodland Training Grounds",
        type: "barracks",
        district: "Military Quarter (The Ranger Citadel)",
        description:
          "Cadets learn tracking, survival, archery, and ambush tactics.",
      },
      forestArsenal: {
        name: "Forest Arsenal",
        type: "landmark",
        district: "Military Quarter (The Ranger Citadel)",
        description:
          "Stores bows, spears, traps, and specialized woodland equipment.",
      },
      pathfinderCommand: {
        name: "Pathfinder Command",
        type: "landmark",
        district: "Military Quarter (The Ranger Citadel)",
        description:
          "Directs reconnaissance missions throughout northern Sanguivorum.",
      },
      houseOfRenewal: {
        name: "House of Renewal",
        type: "healer",
        district: "Military Quarter (The Ranger Citadel)",
        description:
          "Treats injuries sustained in the wilderness using both medicine and natural remedies.",
      },
      watchtreeTower: {
        name: "Watchtree Tower",
        type: "landmark",
        district: "Military Quarter (The Ranger Citadel)",
        description:
          "A living observation tower grown from a single colossal tree overlooking the forest.",
      },
      // ------------------------------------------------- RELIGIOUS QUARTER
      sacredPrecinct: {
        name: "The Sacred Precinct",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Life flourishes through balance. The faithful of Aelthyr believe every living thing has a place within the natural order, and stewardship is among the greatest responsibilities entrusted to mortals.",
      },
      grandTempleOfAelthyr: {
        name: "The Grand Temple of Aelthyr",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Aelthyr"],
        description:
          "The greatest sanctuary devoted to Aelthyr in Sanguivorum. Built from living trees rather than carved stone, it serves as both temple and thriving grove.",
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
          "Welcomes druids, pilgrims, travelers, and those seeking peace beneath the forest canopy.",
      },
      houseOfFaithful: {
        name: "House of the Faithful",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Residence of Silvanor's clergy and caretakers of the sacred groves.",
      },
      gardenOfRenewal: {
        name: "Garden of Renewal",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Aelthyr"],
        description:
          "A living sanctuary where every tree commemorates a life dedicated to protecting nature.",
      },
      sacredArchives: {
        name: "Sacred Archives",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Preserves botanical knowledge, sacred teachings, and centuries of natural history.",
      },
      // ----------------------------------------------------- ARCANE QUARTER
      verdantConclave: {
        name: "The Verdant Conclave",
        type: "guildhall",
        district: "Arcane Quarter (The Verdant Conclave)",
        description:
          "The Kabal's center for natural magic, druidic study, and ecological research.",
      },
      verdantConclaveHall: {
        name: "Verdant Conclave Hall",
        type: "landmark",
        district: "Arcane Quarter (The Verdant Conclave)",
        description:
          "Official headquarters of the Kabal within Silvanor.",
      },
      registryOfNaturalists: {
        name: "Registry of Naturalists",
        type: "landmark",
        district: "Arcane Quarter (The Verdant Conclave)",
        description:
          "Registers druids, nature mages, and magical researchers.",
      },
      chamberOfGrowth: {
        name: "Chamber of Growth",
        type: "landmark",
        district: "Arcane Quarter (The Verdant Conclave)",
        description:
          "Studies plant magic, natural restoration, and harmonious spellcraft.",
      },
      livingRepository: {
        name: "Living Repository",
        type: "landmark",
        district: "Arcane Quarter (The Verdant Conclave)",
        description:
          "A library grown rather than built, containing botanical records, magical flora, and ecological research.",
      },
      groveResidences: {
        name: "Grove Residences",
        type: "residential",
        district: "Arcane Quarter (The Verdant Conclave)",
        description:
          "Housing for resident scholars and nature mages.",
      },
      rootCircle: {
        name: "Root Circle",
        type: "landmark",
        district: "Arcane Quarter (The Verdant Conclave)",
        description:
          "Reserved for sanctioned magical transportation.",
      },
      // ------------------------------------------------------ TRADE QUARTER
      timberExchange: {
        name: "Timber Exchange",
        type: "street",
        district: "Trade Quarter (Timber Exchange)",
        description:
          "Every resource leaving Silvanor is harvested with care.",
      },
      forestGate: {
        name: "Forest Gate",
        type: "gate",
        district: "Trade Quarter (Timber Exchange)",
        description:
          "Primary entrance for timber caravans and woodland trade.",
      },
      harvestOffice: {
        name: "Harvest Office",
        type: "landmark",
        district: "Trade Quarter (Timber Exchange)",
        description:
          "Records all lumber, herbs, and natural resources leaving the forest.",
      },
      timberYards: {
        name: "Timber Yards",
        type: "landmark",
        district: "Trade Quarter (Timber Exchange)",
        description:
          "Stores carefully managed timber harvested under strict regulation.",
      },
      herbalExchange: {
        name: "Herbal Exchange",
        type: "landmark",
        district: "Trade Quarter (Timber Exchange)",
        description:
          "The Empire's largest marketplace for medicinal herbs and botanical ingredients.",
      },
      rangerLogistics: {
        name: "Ranger Logistics",
        type: "landmark",
        district: "Trade Quarter (Timber Exchange)",
        description:
          "Coordinates supplies to frontier outposts.",
      },
      caravanGrounds: {
        name: "Caravan Grounds",
        type: "landmark",
        district: "Trade Quarter (Timber Exchange)",
        description:
          "Staging area for merchants entering and leaving the forest.",
      },
      // ----------------------------------------------------- ARTISAN QUARTER
      woodcraftersWard: {
        name: "Woodcrafter's Ward",
        type: "street",
        district: "Artisan Quarter (Woodcrafter's Ward)",
        description:
          "Craftsmanship inspired by the living forest.",
      },
      heartwoodForge: {
        name: "Heartwood Forge",
        type: "shop",
        district: "Artisan Quarter (Woodcrafter's Ward)",
        shopCategory: "weapons",
        description:
          "Produces elegant hunting weapons and finely balanced blades.",
      },
      livingCarpenter: {
        name: "Living Carpenter",
        type: "landmark",
        district: "Artisan Quarter (Woodcrafter's Ward)",
        description:
          "Constructs homes, bridges, and furnishings using sustainable forestry practices.",
      },
      leafweaverAtelier: {
        name: "Leafweaver Atelier",
        type: "landmark",
        district: "Artisan Quarter (Woodcrafter's Ward)",
        description:
          "Produces travel clothing, cloaks, and ranger attire.",
      },
      amberJewelers: {
        name: "Amber Jewelers",
        type: "shop",
        district: "Artisan Quarter (Woodcrafter's Ward)",
        shopCategory: "jewelry",
        description:
          "Crafts jewelry from amber, gemstones, and polished hardwoods.",
      },
      fletchersHall: {
        name: "Fletcher's Hall",
        type: "landmark",
        district: "Artisan Quarter (Woodcrafter's Ward)",
        description:
          "Produces bows, arrows, crossbows, and hunting equipment.",
      },
      artisanGrove: {
        name: "Artisan Grove",
        type: "landmark",
        district: "Artisan Quarter (Woodcrafter's Ward)",
        description:
          "Shared workshops where woodworkers and craftsmen collaborate.",
      },
      // --------------------------------------------------- NOBLE QUARTER
      canopyHeights: {
        name: "Canopy Heights",
        type: "residential",
        district: "Noble Quarter (Canopy Heights)",
        description:
          "The highest platforms within the oldest trees are reserved for Silvanor's leaders.",
      },
      houseOfGreenWarden: {
        name: "House of the Green Warden",
        type: "landmark",
        district: "Noble Quarter (Canopy Heights)",
        description:
          "Residence of Silvanor's Ascendus senator.",
      },
      elderBoughEstates: {
        name: "Elder Bough Estates",
        type: "residential",
        district: "Noble Quarter (Canopy Heights)",
        description:
          "Homes of respected Dragonborn families, master foresters, and distinguished rangers.",
      },
      embassyGrove: {
        name: "Embassy Grove",
        type: "residential",
        district: "Noble Quarter (Canopy Heights)",
        description:
          "Foreign dignitaries reside within carefully cultivated woodland estates.",
      },
      crownCanopyGardens: {
        name: "Crown Canopy Gardens",
        type: "landmark",
        district: "Noble Quarter (Canopy Heights)",
        description:
          "An elevated garden offering breathtaking views above the forest canopy.",
      },
      hallOfSeasons: {
        name: "Hall of Seasons",
        type: "landmark",
        district: "Noble Quarter (Canopy Heights)",
        description:
          "Recognizes extraordinary service in conservation, exploration, and defense.",
      },
      wardensCircle: {
        name: "Warden's Circle",
        type: "landmark",
        district: "Noble Quarter (Canopy Heights)",
        description:
          "A gathering place for rangers, scholars, and civic leaders.",
      },
      // ------------------------------------------------ CITY LANDMARKS
      worldwoodHall: {
        name: "The Worldwood Hall",
        type: "landmark",
        district: "City Landmarks",
        description:
          "Silvanor's greatest structure, grown from an immense living tree whose trunk houses government chambers, public halls, and civic gatherings.",
      },
      elderGrove: {
        name: "The Elder Grove",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A sacred stand of ancient trees believed to have existed long before the city's founding.",
      },
      dragonsPerch: {
        name: "Dragon's Perch",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A towering platform overlooking the forest, traditionally used by Dragonborn leaders for important ceremonies.",
      },
      skyBridges: {
        name: "The Sky Bridges",
        type: "landmark",
        district: "City Landmarks",
        description:
          "An intricate network of elevated walkways connecting the city's upper districts through the canopy.",
      },
      // ------------------------------------------------- EXPLORATION LOCATIONS
      // Standalone and unsafe, same structure as the other cities' batches
      // — the maze of roots and the reclaimed fallen giant get "ruin" for
      // skeleton/zombie/animated-armor encounters alongside the bandit/
      // hired-blade "urban" pool. The Ancient Nursery, Ranger Outpost, and
      // Canopy Outlook are all still-active, maintained sites, so they
      // stay "urban" only. The Deep Grove instead gets "forest" (not
      // "urban") — checked the bestiary first (stoneback_beetle/
      // ridgeback_boar/vampire_turned all common, vampire_lesser
      // uncommon; the one forest-tagged unique, Vaelorn, is
      // Vaeloris-nation-locked and won't spawn here anyway) and confirmed
      // a genuinely balanced pool, the same reasoning applied to
      // Vulcaron's volcanic-only Magma Caverns.
      deepGrove: {
        name: "The Deep Grove",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["forest"],
        description:
          "A forbidden section of the ancient forest where few citizens willingly travel and dangerous creatures roam beneath perpetual shade.",
      },
      whisperingRoots: {
        name: "The Whispering Roots",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "A maze of enormous exposed roots said to carry strange echoes through the earth.",
      },
      ancientNursery: {
        name: "The Ancient Nursery",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A protected grove preserving the descendants of the first trees planted when Silvanor was founded.",
      },
      fallenGiant: {
        name: "Fallen Giant",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "The enormous trunk of a centuries-old tree now reclaimed by wildlife and adventurers alike.",
      },
      rangerOutpost: {
        name: "Ranger Outpost",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A forward base where expeditions into the surrounding wilderness begin.",
      },
      canopyOutlook: {
        name: "Canopy Outlook",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "The highest accessible platform in Silvanor, offering sweeping views across the endless forest that surrounds the city.",
      },
    },
  },
  nepturon: {
    name: "Nepturon",
    title: "The Shield Upon the Sea",
    nation: "sanguivorum",
    terrain: "coast",
    isCity: true,
    danger: 1,
    services: ["rest", "shop"],
    description:
      "Where Aphroneth welcomes the world, Nepturon guards it. Every harbor, drydock, and avenue exists to support Sanguivorum's naval supremacy. Warships dominate the skyline, disciplined marines patrol the streets, and the city's heartbeat is measured by the departure and return of imperial fleets. More than a city, Nepturon is a permanent naval installation with a civilian population built around it. It is also home to the Aqualis Eruditus, the Empire's foremost academy of naval warfare and maritime magic.",
    connections: [
      { to: "silvanor", days: 3, mode: "road" },
      { to: "arnoneth", days: 3, mode: "road" },
      { to: "tritonath", days: 2, mode: "road", desc: "along the fjord" },
    ],
    // Nepturon's real district layout, built quarter by quarter (same
    // workflow as Arethon, Zuevaron, Aphroneth, Tritonath, Vulcaron,
    // Daedaron, Minervon, Silvanor, Victorath, Marsatum, and Apollyon) —
    // the Civic Quarter (The Admiralty Forum) is the first. Every place
    // carries a `district` tag for grouping in cmdLook/cmdPlaces; the
    // Admiralty Forum itself is the district's own walkable hub, so it
    // doesn't need one. Nepturon replaces the existing "netturon" stub —
    // near-identical name, same situation as Tritonath/Tritoneth and
    // Victorath/Victolath, another accidental letter-swap during
    // reference-pulling (the old stub's own lore — "near the fjord coast,
    // where the Legionus Aqualis keeps a permanent garrison" — matches
    // Nepturon's naval-installation theme too closely to be coincidence).
    // Terrain corrected from "plains" to "coast" to match the new lore's
    // harbor/drydock/fleet setting (same kind of correction as Silvanor's
    // forest terrain fix). Prior danger level (1), services (rest, shop),
    // and road connections (Silvanor/Arnoneth/Tritonath) are preserved.
    // Patron deity Chronaeus.
    sublocations: {
      admiraltyForum: {
        name: "The Admiralty Forum",
        type: "street",
        district: "Civic Quarter (The Admiralty Forum)",
        description:
          "The administrative heart of Nepturon, where every decision serves the fleet.",
      },
      admiralsGate: {
        name: "The Admiral's Gate",
        type: "gate",
        district: "Civic Quarter (The Admiralty Forum)",
        description:
          "The fortified entrance to the city where military convoys and official visitors arrive beneath the banners of the Legionus Aqualis.",
      },
      hallOfAdmiralty: {
        name: "Hall of Admiralty",
        type: "landmark",
        district: "Civic Quarter (The Admiralty Forum)",
        description:
          "Seat of Nepturon's Ascendus senator and the administrative headquarters of the city's naval command.",
      },
      victorySquare: {
        name: "Victory Square",
        type: "street",
        district: "Civic Quarter (The Admiralty Forum)",
        description:
          "A broad parade ground where fleets are welcomed home and officers receive commendations.",
      },
      navalLedger: {
        name: "The Naval Ledger",
        type: "board",
        district: "Civic Quarter (The Admiralty Forum)",
        description:
          "Naval patrols, escort contracts, coastal investigations, and military commissions are posted here.",
      },
      officersWard: {
        name: "Officer's Ward",
        type: "residential",
        district: "Civic Quarter (The Admiralty Forum)",
        description:
          "Home to naval officers, academy instructors, and long-serving military families.",
      },
      harborVigilisHeadquarters: {
        name: "Harbor Vigilis Headquarters",
        type: "barracks",
        district: "Civic Quarter (The Admiralty Forum)",
        description:
          "The city watch maintains discipline ashore while coordinating closely with naval authorities.",
      },
      // ------------------------------------------------ COMMERCIAL QUARTER
      fleetMarket: {
        name: "Fleet Market",
        type: "street",
        district: "Commercial Quarter (Fleet Market)",
        description:
          "Built to supply fleets rather than merchants.",
      },
      fleetProvisions: {
        name: "Fleet Provisions",
        type: "market",
        district: "Commercial Quarter (Fleet Market)",
        description:
          "Stocks durable equipment, expedition supplies, preserved food, and travel necessities.",
      },
      theIronKeel: {
        name: "The Iron Keel",
        type: "shop",
        district: "Commercial Quarter (Fleet Market)",
        shopCategory: "weapons",
        description:
          "Produces military-grade weapons alongside anchors, chains, reinforced hull fittings, and siege hardware.",
      },
      theDeepGuard: {
        name: "The Deep Guard",
        type: "shop",
        district: "Commercial Quarter (Fleet Market)",
        shopCategory: "armor",
        description:
          "Specializes in marine armor, boarding shields, and equipment designed for prolonged exposure to saltwater.",
      },
      theSaltApothecary: {
        name: "The Salt Apothecary",
        type: "shop",
        district: "Commercial Quarter (Fleet Market)",
        shopCategory: "potions",
        description:
          "Provides medicines for sailors, antidotes, sea remedies, diving tonics, and emergency medical supplies.",
      },
      cavalryPierStables: {
        name: "Cavalry Pier Stables",
        type: "landmark",
        district: "Commercial Quarter (Fleet Market)",
        description:
          "Maintains mounts for officers and military couriers traveling inland.",
      },
      theAdmiralsRest: {
        name: "The Admiral's Rest",
        type: "inn",
        district: "Commercial Quarter (Fleet Market)",
        description:
          "A respectable inn favored by naval officers, visiting dignitaries, and experienced captains.",
      },
      fleetTreasury: {
        name: "Fleet Treasury",
        type: "landmark",
        district: "Commercial Quarter (Fleet Market)",
        description:
          "Handles military payroll, merchant accounts, and secure naval contracts.",
      },
      navalSupplyOffice: {
        name: "Naval Supply Office",
        type: "guildhall",
        district: "Commercial Quarter (Fleet Market)",
        description:
          "Coordinates procurement for fleets operating across Sanguivorum's western waters.",
      },
      // -------------------------------------------------- MILITARY QUARTER
      admiraltyCitadel: {
        name: "The Admiralty Citadel",
        type: "barracks",
        district: "Military Quarter (The Admiralty Citadel)",
        description:
          "The beating heart of Sanguivorum's navy.",
      },
      admiraltyFortress: {
        name: "Admiralty Fortress",
        type: "landmark",
        district: "Military Quarter (The Admiralty Citadel)",
        description:
          "The headquarters of the Legionus Aqualis and the supreme command of the western fleet.",
      },
      hallOfCaptains: {
        name: "Hall of Captains",
        type: "landmark",
        district: "Military Quarter (The Admiralty Citadel)",
        description:
          "Planning chambers where campaigns, patrol routes, and naval deployments are directed.",
      },
      marineBarracks: {
        name: "Marine Barracks",
        type: "barracks",
        district: "Military Quarter (The Admiralty Citadel)",
        description:
          "Housing for the Empire's elite marines and boarding specialists.",
      },
      boardingGrounds: {
        name: "Boarding Grounds",
        type: "landmark",
        district: "Military Quarter (The Admiralty Citadel)",
        description:
          "Purpose-built training ships allow sailors and marines to practice combat before ever reaching open water.",
      },
      navalArsenal: {
        name: "Naval Arsenal",
        type: "landmark",
        district: "Military Quarter (The Admiralty Citadel)",
        description:
          "Stores weapons, armor, siege engines, and naval ordnance.",
      },
      quartermasterFleetDepot: {
        name: "Quartermaster Fleet Depot",
        type: "landmark",
        district: "Military Quarter (The Admiralty Citadel)",
        description:
          "Coordinates supplies for every vessel stationed in Nepturon.",
      },
      houseOfSafeHarbor: {
        name: "House of Safe Harbor",
        type: "healer",
        district: "Military Quarter (The Admiralty Citadel)",
        description:
          "Treats sailors, marines, and those injured during naval engagements.",
      },
      signalBastion: {
        name: "Signal Bastion",
        type: "landmark",
        district: "Military Quarter (The Admiralty Citadel)",
        description:
          "A towering command structure that communicates with the fleet using beacon fires, banners, and magical signaling.",
      },
      // ------------------------------------------------- RELIGIOUS QUARTER
      // The source lists the Grand Temple only as "[Canonical Grand Temple
      // Name of Chronaeus]" — following the naming convention used for
      // every other patron deity's primary temple in Sanguivorum ("The
      // Grand Temple of X"), since Chronaeus has no existing canonical name
      // established elsewhere in the data.
      sacredPrecinct: {
        name: "The Sacred Precinct",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Time governs every fleet. The tides, seasons, watches, and voyages all obey a rhythm greater than mankind. For this reason, Nepturon honors Chronaeus, whose teachings emphasize patience, precision, and respecting the passage of time.",
      },
      grandTempleOfChronaeus: {
        name: "The Grand Temple of Chronaeus",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Chronaeus"],
        description:
          "The foremost temple of Chronaeus in Sanguivorum, where captains seek wisdom before long voyages and sailors give thanks for returning in their appointed time.",
      },
      hallOfTwelve: {
        name: "Hall of the Twelve",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Aelthyr", "Mortasha", "Veylana", "Kar'Mhal", "Ithrien", "Seressa", "Nystros", "Xalaxar", "Aethyra", "Pyreith", "Aqualis", "Chronaeus"],
        description:
          "Contains twelve equal shrines honoring every deity of Fragmenta.",
      },
      pilgrimsRest: {
        name: "Pilgrim's Rest",
        type: "inn",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Provides lodging for pilgrims, sailors, and travelers.",
      },
      houseOfFaithful: {
        name: "House of the Faithful",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Residence of Nepturon's clergy and center of the local faith.",
      },
      gardenOfReflection: {
        name: "Garden of Reflection",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Chronaeus"],
        description:
          "A quiet courtyard where flowing water marks the passing of time.",
      },
      sacredArchives: {
        name: "Sacred Archives",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Preserves sacred texts, maritime records, and centuries of religious history.",
      },
      // ---------------------------------------------------- ARCANE QUARTER
      aqualisEruditus: {
        name: "The Aqualis Eruditus",
        type: "street",
        district: "Arcane Quarter (The Aqualis Eruditus)",
        description:
          "The Empire's premier academy of naval warfare, maritime magic, and oceanic research. It serves as the naval counterpart to Minervon's School of Manipulum Eruditetus.",
      },
      hallOfTides: {
        name: "Hall of Tides",
        type: "landmark",
        district: "Arcane Quarter (The Aqualis Eruditus)",
        description:
          "Primary lecture hall where naval strategy and magical navigation are taught.",
      },
      registryOfNavigators: {
        name: "Registry of Navigators",
        type: "landmark",
        district: "Arcane Quarter (The Aqualis Eruditus)",
        description:
          "Registers naval mages and licensed maritime practitioners.",
      },
      chamberOfCurrents: {
        name: "Chamber of Currents",
        type: "landmark",
        district: "Arcane Quarter (The Aqualis Eruditus)",
        description:
          "Advanced instruction in hydromancy, weather manipulation, and maritime spellcraft.",
      },
      oceanicRepository: {
        name: "Oceanic Repository",
        type: "landmark",
        district: "Arcane Quarter (The Aqualis Eruditus)",
        description:
          "Maintains the Empire's largest archive concerning sea monsters, ocean currents, magical storms, and naval expeditions.",
      },
      cadetResidence: {
        name: "Cadet Residence",
        type: "residential",
        district: "Arcane Quarter (The Aqualis Eruditus)",
        description:
          "Housing for students and instructors of the Eruditus.",
      },
      beaconCircle: {
        name: "Beacon Circle",
        type: "landmark",
        district: "Arcane Quarter (The Aqualis Eruditus)",
        description:
          "Reserved for sanctioned magical transportation.",
      },
      // ----------------------------------------------------- TRADE QUARTER
      grandDrydocks: {
        name: "The Grand Drydocks",
        type: "docks",
        district: "Trade Quarter (The Grand Drydocks)",
        description:
          "The industrial harbor responsible for building and maintaining the Empire's fleets.",
      },
      fleetHarbor: {
        name: "Fleet Harbor",
        type: "docks",
        district: "Trade Quarter (The Grand Drydocks)",
        description:
          "Military harbor where warships enter and depart.",
      },
      navalCustomsOffice: {
        name: "Naval Customs Office",
        type: "landmark",
        district: "Trade Quarter (The Grand Drydocks)",
        description:
          "Processes military cargo and authorized civilian shipments.",
      },
      theGreatDrydocks: {
        name: "The Great Drydocks",
        type: "docks",
        district: "Trade Quarter (The Grand Drydocks)",
        description:
          "Massive enclosed docks where imperial vessels are constructed and repaired.",
      },
      fleetWarehouses: {
        name: "Fleet Warehouses",
        type: "landmark",
        district: "Trade Quarter (The Grand Drydocks)",
        description:
          "Stores food, lumber, sailcloth, weapons, and naval equipment.",
      },
      harborLogisticsBureau: {
        name: "Harbor Logistics Bureau",
        type: "guildhall",
        district: "Trade Quarter (The Grand Drydocks)",
        description:
          "Coordinates supply chains for fleets operating across the western coast.",
      },
      dockmastersOffice: {
        name: "Dockmaster's Office",
        type: "landmark",
        district: "Trade Quarter (The Grand Drydocks)",
        description:
          "Assigns berths, oversees repairs, and manages naval traffic.",
      },
      // --------------------------------------------------- ARTISAN QUARTER
      // No jeweler in this quarter's source (same as Aphroneth's Shipwright's
      // Ward) — every named workshop here stays flavor-only rather than a
      // real shop, matching that precedent.
      shipwrightDistrict: {
        name: "Shipwright District",
        type: "street",
        district: "Artisan Quarter (Shipwright District)",
        description:
          "Everything required to build a fleet can be found here.",
      },
      ironTide: {
        name: "The Iron Tide",
        type: "landmark",
        district: "Artisan Quarter (Shipwright District)",
        description:
          "Produces naval hardware, anchors, reinforced chains, and heavy fittings.",
      },
      sailwrightHall: {
        name: "Sailwright Hall",
        type: "landmark",
        district: "Artisan Quarter (Shipwright District)",
        description:
          "Crafts sails, naval banners, and expedition canvas.",
      },
      navigatorsCompass: {
        name: "Navigator's Compass",
        type: "landmark",
        district: "Artisan Quarter (Shipwright District)",
        description:
          "Specializes in maps, compasses, sextants, charts, and navigation instruments.",
      },
      theRopewalk: {
        name: "The Ropewalk",
        type: "landmark",
        district: "Artisan Quarter (Shipwright District)",
        description:
          "Produces rigging, rope, and heavy cable.",
      },
      imperialDrydockWorks: {
        name: "Imperial Drydock Works",
        type: "landmark",
        district: "Artisan Quarter (Shipwright District)",
        description:
          "Constructs and repairs military vessels.",
      },
      harborCarpenter: {
        name: "Harbor Carpenter",
        type: "landmark",
        district: "Artisan Quarter (Shipwright District)",
        description:
          "Produces masts, docks, siege timbers, and structural components.",
      },
      // ----------------------------------------------------- NOBLE QUARTER
      officersHeights: {
        name: "Officer's Heights",
        type: "residential",
        district: "Noble Quarter (Officer's Heights)",
        description:
          "Reserved for admirals, senior officers, academy masters, and distinguished naval families.",
      },
      admiraltyHouse: {
        name: "Admiralty House",
        type: "landmark",
        district: "Noble Quarter (Officer's Heights)",
        description:
          "Residence of the city's senior naval commander.",
      },
      commandEstates: {
        name: "Command Estates",
        type: "residential",
        district: "Noble Quarter (Officer's Heights)",
        description:
          "Homes of decorated admirals and naval officials.",
      },
      embassyRow: {
        name: "Embassy Row",
        type: "residential",
        district: "Noble Quarter (Officer's Heights)",
        description:
          "Foreign naval attachés and diplomatic representatives.",
      },
      victoryGardens: {
        name: "Victory Gardens",
        type: "landmark",
        district: "Noble Quarter (Officer's Heights)",
        description:
          "Formal gardens overlooking the harbor where military ceremonies are held.",
      },
      hallOfNavalHonors: {
        name: "Hall of Naval Honors",
        type: "landmark",
        district: "Noble Quarter (Officer's Heights)",
        description:
          "Recognizes extraordinary service at sea.",
      },
      captainsCircle: {
        name: "Captain's Circle",
        type: "landmark",
        district: "Noble Quarter (Officer's Heights)",
        description:
          "An exclusive gathering place for senior naval officers and academy instructors.",
      },
      // --------------------------------------------------- CITY LANDMARKS
      grandFleetAnchorage: {
        name: "The Grand Fleet Anchorage",
        type: "landmark",
        district: "City Landmarks",
        description:
          "The largest concentration of imperial warships in Fragmenta.",
      },
      admiraltySpire: {
        name: "The Admiralty Spire",
        type: "landmark",
        district: "City Landmarks",
        description:
          "The tallest structure in Nepturon, used to coordinate fleet movements across the western sea.",
      },
      wallOfOaths: {
        name: "The Wall of Oaths",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A memorial engraved with the names of sailors and marines who never returned from duty.",
      },
      harborBatteries: {
        name: "The Harbor Batteries",
        type: "landmark",
        district: "City Landmarks",
        description:
          "Massive coastal fortifications protecting the harbor approaches.",
      },
      // ------------------------------------------------- EXPLORATION LOCATIONS
      // "Ruin" goes to the two places actually described as decayed/collapsed
      // (Wrecker's Graveyard's "remains of ships lost over centuries",
      // Forgotten Slipway's "abandoned... long forgotten"), same standard as
      // Vulcaron's Abandoned Shaft/Forgotten Forge — active-but-secluded spots
      // (Old Lighthouse, Stormwatch Point, Breakwater Walk) stay "urban" only,
      // matching Aphroneth's Gull's Watch/Deep Anchorage. The Sea Caves adds
      // "cave" alongside "urban"/"ruin" — like "volcanic" for Vulcaron's Magma
      // Caverns, "cave" has genuine common-tier wildlife (Stoneback Beetle,
      // Cave Scorpion) rather than only rare/elite/world-boss (the reason
      // "coast" was rejected for Aphroneth's Tide Pools), so it adds real
      // variety without unbalancing this one spot.
      theSeaCaves: {
        name: "The Sea Caves",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin", "cave"],
        description:
          "Ancient caverns beneath the cliffs occasionally used by smugglers and far more dangerous inhabitants.",
      },
      wreckersGraveyard: {
        name: "The Wrecker's Graveyard",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "A rocky coastline littered with the remains of ships lost over centuries.",
      },
      oldLighthouse: {
        name: "The Old Lighthouse",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A decommissioned beacon predating Nepturon's current harbor defenses.",
      },
      forgottenSlipway: {
        name: "The Forgotten Slipway",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "An abandoned military dock whose original purpose has long been forgotten.",
      },
      stormwatchPoint: {
        name: "Stormwatch Point",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A cliffside observation post monitoring dangerous weather and unusual activity at sea.",
      },
      breakwaterWalk: {
        name: "The Breakwater Walk",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A fortified promenade stretching along the harbor walls, offering sweeping views of Sanguivorum's western fleet.",
      },
    },
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
      { to: "nepturon", days: 3, mode: "road" },
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
      { to: "victorath", days: 3, mode: "road" },
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
      // ------------------------------------------------- EXPLORATION LOCATIONS
      // Standalone and unsafe, same structure as the other cities' batches
      // — the abandoned practice fortifications and ruined siegeworks get
      // "ruin" for skeleton/zombie/animated-armor encounters alongside the
      // bandit/hired-blade "urban" pool. The Hidden Archives (restricted,
      // not decayed), Officer's Trial, Scout's Camp, and Commander's
      // Outlook are all still-active, maintained sites rather than actual
      // ruins, so they stay "urban" only.
      oldTrainingGrounds: {
        name: "The Old Training Grounds",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "Abandoned practice fortifications now occupied by dangerous creatures and forgotten secrets.",
      },
      hiddenArchives: {
        name: "The Hidden Archives",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A restricted collection of sealed military records unavailable to the public.",
      },
      forgottenSiegeworks: {
        name: "The Forgotten Siegeworks",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "Ruins of an early academy where primitive siege engines were first developed.",
      },
      officersTrial: {
        name: "The Officer's Trial",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "An advanced obstacle course reserved for elite cadets, occasionally opened for special challenges.",
      },
      scoutsCamp: {
        name: "Scout's Camp",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A forward operating base where reconnaissance missions and strategic expeditions begin.",
      },
      commandersOutlook: {
        name: "Commander's Outlook",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "The highest hill overlooking Minervon, used by instructors to teach battlefield analysis while providing panoramic views of the surrounding countryside.",
      },
    },
  },
  marsatum: {
    name: "Marsatum",
    title: "The Western Shield",
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    danger: 3,
    services: ["rest", "guild"],
    description:
      "Standing where civilization gives way to the untamed borders of Vaeloris, Marsatum has endured centuries of tension without ever breaking. Unlike Arethon, whose strength lies in rapid response, Marsatum embodies steadfast defense. Massive walls, disciplined garrisons, and generations of veteran soldiers have earned the city a reputation as the Empire's immovable bulwark. Every stone reminds its people that holding the line is often the greatest victory.",
    connections: [
      { to: "decearon", days: 4, mode: "road" },
      { to: "victorath", days: 2, mode: "road" },
    ],
    // Marsatum's real district layout, built quarter by quarter (same
    // workflow as Arethon, Zuevaron, Aphroneth, Tritonath, Vulcaron,
    // Daedaron, Minervon, Silvanor, and Victorath) — the Civic Quarter
    // (The Bastion Forum) is the first. Every place carries a `district`
    // tag for grouping in cmdLook/cmdPlaces; the Bastion Forum itself is
    // the district's own walkable hub, so it doesn't need one. Marsatum
    // is an existing stub (exact name match, no rename needed, same as
    // Vulcaron/Minervon/Silvanor) — its prior danger level and services
    // (rest, guild) are preserved; terrain stays "plains". Patron deity
    // Xalaxar.
    sublocations: {
      bastionForum: {
        name: "The Bastion Forum",
        type: "street",
        district: "Civic Quarter (The Bastion Forum)",
        description:
          "The administrative heart of Marsatum, where every civic decision serves the defense of the western frontier.",
      },
      westernGate: {
        name: "The Western Gate",
        type: "gate",
        district: "Civic Quarter (The Bastion Forum)",
        description:
          "A towering fortress gate that has withstood countless sieges and serves as the primary entrance into the city.",
      },
      hallOfShield: {
        name: "Hall of the Shield",
        type: "landmark",
        district: "Civic Quarter (The Bastion Forum)",
        description:
          "Seat of Marsatum's Ascendus senator and center of western frontier administration.",
      },
      bastionSquare: {
        name: "Bastion Square",
        type: "street",
        district: "Civic Quarter (The Bastion Forum)",
        description:
          "The city's central gathering place where military honors, civic ceremonies, and public announcements are held.",
      },
      defendersLedger: {
        name: "The Defender's Ledger",
        type: "board",
        district: "Civic Quarter (The Bastion Forum)",
        description:
          "Patrol assignments, monster hunts, frontier escorts, and military contracts are posted daily.",
      },
      veteransWard: {
        name: "Veteran's Ward",
        type: "residential",
        district: "Civic Quarter (The Bastion Forum)",
        description:
          "Home to retired Legionnaires, frontier families, and generations of defenders.",
      },
      frontierVigilisHeadquarters: {
        name: "Frontier Vigilis Headquarters",
        type: "barracks",
        district: "Civic Quarter (The Bastion Forum)",
        description:
          "Maintains law and order while coordinating closely with the Legion.",
      },
      // ------------------------------------------------ COMMERCIAL QUARTER
      bastionMarket: {
        name: "Bastion Market",
        type: "street",
        district: "Commercial Quarter (Bastion Market)",
        description:
          "A marketplace built around endurance rather than luxury.",
      },
      frontierSupply: {
        name: "Frontier Supply",
        type: "market",
        district: "Commercial Quarter (Bastion Market)",
        description:
          "Stocks expedition gear, preserved provisions, repair kits, and survival equipment.",
      },
      shieldbreakerForge: {
        name: "Shieldbreaker Forge",
        type: "shop",
        district: "Commercial Quarter (Bastion Market)",
        shopCategory: "weapons",
        description:
          "Produces dependable weapons built to withstand years of military service.",
      },
      ironBastion: {
        name: "The Iron Bastion",
        type: "shop",
        district: "Commercial Quarter (Bastion Market)",
        shopCategory: "armor",
        description:
          "Known for exceptionally durable heavy armor favored by frontier veterans.",
      },
      stonerootRemedies: {
        name: "Stoneroot Remedies",
        type: "shop",
        district: "Commercial Quarter (Bastion Market)",
        shopCategory: "potions",
        description:
          "Produces battlefield medicines, antitoxins, and remedies for long patrols.",
      },
      legionStables: {
        name: "Legion Stables",
        type: "landmark",
        district: "Commercial Quarter (Bastion Market)",
        description:
          "Maintains hardy frontier horses bred for endurance.",
      },
      lastWatch: {
        name: "The Last Watch",
        type: "inn",
        district: "Commercial Quarter (Bastion Market)",
        description:
          "A quiet inn frequented by soldiers, scouts, and weary travelers returning from the frontier.",
      },
      bastionTreasury: {
        name: "Bastion Treasury",
        type: "landmark",
        district: "Commercial Quarter (Bastion Market)",
        description:
          "Handles military payroll, merchant accounts, and secure storage.",
      },
      frontierMerchantGuild: {
        name: "Frontier Merchant Guild",
        type: "guildhall",
        district: "Commercial Quarter (Bastion Market)",
        description:
          "Coordinates commerce supplying the western frontier.",
      },
      // ------------------------------------------------- MILITARY QUARTER
      // Unlike the usual hub/flagship-building name collisions in other
      // cities, the hub here ("The Western Bastion") and its primary
      // fortress ("The Great Bastion") are genuinely distinct names, so no
      // merge is needed. Note: the source also names a Military Quarter
      // building "Hall of Guardians" and, separately, a Noble Quarter honor
      // hall the exact same thing — a real naming collision (unlike the
      // intentional hub/flagship echo pattern). Per the user, the Noble
      // Quarter one is renamed "Hall of Distinguished Service" below to
      // keep both independently reachable; this Military Quarter building
      // keeps the source name as written.
      westernBastion: {
        name: "The Western Bastion",
        type: "street",
        district: "Military Quarter (The Western Bastion)",
        description:
          "The largest military complex on Sanguivorum's western border.",
      },
      greatBastion: {
        name: "The Great Bastion",
        type: "barracks",
        district: "Military Quarter (The Western Bastion)",
        description:
          "The primary fortress defending Marsatum and coordinating western military operations.",
      },
      hallOfGuardians: {
        name: "Hall of Guardians",
        type: "landmark",
        district: "Military Quarter (The Western Bastion)",
        description:
          "Strategic headquarters overseeing frontier defenses.",
      },
      legionBarracks: {
        name: "Legion Barracks",
        type: "barracks",
        district: "Military Quarter (The Western Bastion)",
        description:
          "Housing for the permanent western garrison.",
      },
      defendersGrounds: {
        name: "Defender's Grounds",
        type: "barracks",
        district: "Military Quarter (The Western Bastion)",
        description:
          "Large training fields emphasizing shield formations, endurance, and defensive warfare.",
      },
      westernArsenal: {
        name: "Western Arsenal",
        type: "landmark",
        district: "Military Quarter (The Western Bastion)",
        description:
          "Stores weapons, armor, siege equipment, and emergency supplies.",
      },
      frontierCommand: {
        name: "Frontier Command",
        type: "landmark",
        district: "Military Quarter (The Western Bastion)",
        description:
          "Coordinates patrols, forts, and outposts across the western border.",
      },
      houseOfRecovery: {
        name: "House of Recovery",
        type: "healer",
        district: "Military Quarter (The Western Bastion)",
        description:
          "Treats wounded soldiers returning from patrol.",
      },
      sentinelTower: {
        name: "Sentinel Tower",
        type: "landmark",
        district: "Military Quarter (The Western Bastion)",
        description:
          "The tallest military watchtower overlooking the western frontier.",
      },
      // ------------------------------------------------- RELIGIOUS QUARTER
      sacredPrecinct: {
        name: "The Sacred Precinct",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "The people of Marsatum honor Xalaxar, believing that true strength is measured not by conquest but by the resolve to endure hardship without yielding.",
      },
      grandTempleOfXalaxar: {
        name: "The Grand Temple of Xalaxar",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Xalaxar"],
        description:
          "The greatest temple dedicated to Xalaxar in Sanguivorum. Legionnaires departing for the frontier seek blessings of resilience, while returning veterans offer thanks for surviving another campaign.",
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
          "Provides shelter for pilgrims, soldiers, and weary travelers.",
      },
      houseOfFaithful: {
        name: "House of the Faithful",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Residence of Marsatum's clergy.",
      },
      gardenOfEndurance: {
        name: "Garden of Endurance",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Xalaxar"],
        description:
          "A simple stone garden where weathered monuments symbolize perseverance through adversity.",
      },
      sacredArchives: {
        name: "Sacred Archives",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Preserves scripture, military memorials, and the city's religious history.",
      },
      // ----------------------------------------------------- ARCANE QUARTER
      frontierConclave: {
        name: "The Frontier Conclave",
        type: "guildhall",
        district: "Arcane Quarter (The Frontier Conclave)",
        description:
          "The Kabal's western headquarters specializes in defensive magic, battlefield support, and monitoring magical activity along the frontier.",
      },
      frontierConclaveHall: {
        name: "Frontier Conclave Hall",
        type: "landmark",
        district: "Arcane Quarter (The Frontier Conclave)",
        description:
          "Official headquarters of the Kabal within Marsatum.",
      },
      registryOfWardens: {
        name: "Registry of Wardens",
        type: "landmark",
        district: "Arcane Quarter (The Frontier Conclave)",
        description:
          "Registers frontier mages and military spellcasters.",
      },
      chamberOfWards: {
        name: "Chamber of Wards",
        type: "landmark",
        district: "Arcane Quarter (The Frontier Conclave)",
        description:
          "Instruction in defensive magic, protective barriers, and battlefield support.",
      },
      archiveOfVigilance: {
        name: "Archive of Vigilance",
        type: "landmark",
        district: "Arcane Quarter (The Frontier Conclave)",
        description:
          "Contains records of frontier magical activity, hostile creatures, and defensive research.",
      },
      mageBarracks: {
        name: "Mage Barracks",
        type: "residential",
        district: "Arcane Quarter (The Frontier Conclave)",
        description:
          "Housing for Conclave personnel assigned to the western frontier.",
      },
      wardenCircle: {
        name: "Warden Circle",
        type: "landmark",
        district: "Arcane Quarter (The Frontier Conclave)",
        description:
          "Reserved for sanctioned magical transportation.",
      },
      // ------------------------------------------------------ TRADE QUARTER
      caravanExchange: {
        name: "The Caravan Exchange",
        type: "street",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "The logistical center supporting every western fort and frontier settlement.",
      },
      frontierGate: {
        name: "Frontier Gate",
        type: "gate",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "Primary entrance for military caravans and civilian merchants.",
      },
      customsHall: {
        name: "Customs Hall",
        type: "landmark",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "Inspects cargo entering from the western frontier.",
      },
      supplyWarehouses: {
        name: "Supply Warehouses",
        type: "landmark",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "Stores food, equipment, construction materials, and emergency reserves.",
      },
      quartermasterExchange: {
        name: "Quartermaster Exchange",
        type: "landmark",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "Coordinates supplies for forts and outposts throughout the region.",
      },
      freightOffice: {
        name: "Freight Office",
        type: "landmark",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "Organizes transportation throughout western Sanguivorum.",
      },
      wagonYard: {
        name: "Wagon Yard",
        type: "landmark",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "Maintains caravans supporting the frontier.",
      },
      // ----------------------------------------------------- ARTISAN QUARTER
      ironwoodWard: {
        name: "Ironwood Ward",
        type: "street",
        district: "Artisan Quarter (Ironwood Ward)",
        description:
          "Craftsmanship focused on reliability above all else.",
      },
      sentinelForge: {
        name: "Sentinel Forge",
        type: "shop",
        district: "Artisan Quarter (Ironwood Ward)",
        shopCategory: "weapons",
        description:
          "Produces dependable military weapons and tools built for longevity.",
      },
      stonewrightHall: {
        name: "Stonewright Hall",
        type: "landmark",
        district: "Artisan Quarter (Ironwood Ward)",
        description:
          "Constructs walls, towers, and fortifications throughout the western frontier.",
      },
      frontierClothiers: {
        name: "Frontier Clothiers",
        type: "landmark",
        district: "Artisan Quarter (Ironwood Ward)",
        description:
          "Produces heavy cloaks, uniforms, and durable travel clothing.",
      },
      wardensOutfitter: {
        name: "Warden's Outfitter",
        type: "landmark",
        district: "Artisan Quarter (Ironwood Ward)",
        description:
          "Specializes in survival gear, field equipment, maps, and navigation tools.",
      },
      siegeWorkshop: {
        name: "Siege Workshop",
        type: "landmark",
        district: "Artisan Quarter (Ironwood Ward)",
        description:
          "Constructs defensive engines, wagons, and military equipment.",
      },
      ironwoodCarpentry: {
        name: "Ironwood Carpentry",
        type: "landmark",
        district: "Artisan Quarter (Ironwood Ward)",
        description:
          "Produces bridges, watchtowers, siege timbers, and frontier buildings.",
      },
      // --------------------------------------------------- NOBLE QUARTER
      guardianHeights: {
        name: "Guardian Heights",
        type: "residential",
        district: "Noble Quarter (Guardian Heights)",
        description:
          "Home to Marsatum's commanders, veteran families, and civic leaders.",
      },
      houseOfWesternWarden: {
        name: "House of the Western Warden",
        type: "landmark",
        district: "Noble Quarter (Guardian Heights)",
        description:
          "Residence of Marsatum's Ascendus senator.",
      },
      defenderEstates: {
        name: "Defender Estates",
        type: "residential",
        district: "Noble Quarter (Guardian Heights)",
        description:
          "Homes of distinguished officers and respected frontier families.",
      },
      embassyHall: {
        name: "Embassy Hall",
        type: "residential",
        district: "Noble Quarter (Guardian Heights)",
        description:
          "Receives official delegations from neighboring nations.",
      },
      gardenOfResolve: {
        name: "Garden of Resolve",
        type: "landmark",
        district: "Noble Quarter (Guardian Heights)",
        description:
          "A solemn memorial honoring every generation that defended the western border.",
      },
      // Source names this "Hall of Guardians" — identical to the Military
      // Quarter building of the same name. Per the user, renamed to "Hall
      // of Distinguished Service" to keep both independently reachable,
      // matching the same civic-honor-hall role every other city's Noble
      // Quarter has under a unique name (e.g. Minervon's Hall of Triumphs,
      // Victorath's Hall of Laurels).
      hallOfDistinguishedService: {
        name: "Hall of Distinguished Service",
        type: "landmark",
        district: "Noble Quarter (Guardian Heights)",
        description:
          "Recognizes extraordinary courage and lifelong military service.",
      },
      veteransCircle: {
        name: "Veteran's Circle",
        type: "landmark",
        district: "Noble Quarter (Guardian Heights)",
        description:
          "A respected gathering place where retired officers mentor younger commanders.",
      },
      // ------------------------------------------------ CITY LANDMARKS
      wallOfAges: {
        name: "The Wall of Ages",
        type: "landmark",
        district: "City Landmarks",
        description:
          "An immense defensive wall that has protected Marsatum for centuries, bearing the scars of countless sieges.",
      },
      shieldMonument: {
        name: "The Shield Monument",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A colossal stone shield standing in the city's central square, symbolizing unwavering resolve.",
      },
      guardiansKeep: {
        name: "Guardian's Keep",
        type: "landmark",
        district: "City Landmarks",
        description:
          "The oldest fortress in Marsatum, continuously occupied since the city's founding.",
      },
      eternalWatchfire: {
        name: "The Eternal Watchfire",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A beacon that has never been allowed to extinguish, representing the Empire's eternal vigilance.",
      },
      // ------------------------------------------------- EXPLORATION LOCATIONS
      // Standalone and unsafe, same structure as the other cities' batches
      // — the abandoned fort and crumbling ramparts get "ruin" for
      // skeleton/zombie/animated-armor encounters alongside the bandit/
      // hired-blade "urban" pool. The Watcher's Trail, The Fallen
      // Battlefield, Frontier Outpost, and Bastion Overlook are all
      // preserved or still-active maintained sites, so they stay "urban"
      // only.
      forgottenFort: {
        name: "The Forgotten Fort",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "An abandoned border fortress rumored to conceal hidden passages, forgotten supplies, and lingering dangers.",
      },
      oldRamparts: {
        name: "The Old Ramparts",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "Crumbling defensive walls from Marsatum's earliest expansion, now reclaimed by nature.",
      },
      watchersTrail: {
        name: "The Watcher's Trail",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A patrol route stretching deep into the frontier, often serving as the starting point for military expeditions.",
      },
      fallenBattlefield: {
        name: "The Fallen Battlefield",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "The site of one of the Empire's most hard-fought defensive victories, preserved as a place of remembrance.",
      },
      frontierOutpost: {
        name: "Frontier Outpost",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A forward command post where scouting missions, supply runs, and border investigations originate.",
      },
      bastionOverlook: {
        name: "Bastion Overlook",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A high bluff overlooking the western frontier, offering a commanding view of the forests beyond the Empire's walls.",
      },
    },
  },
  victorath: {
    name: "Victorath",
    title: "The City of the Victor's Crown",
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    danger: 3,
    services: ["rest", "guild"],
    description:
      "Where Marsatum is the shield that refuses to break, Victorath is the sword that strikes back. Built upon the site of one of Sanguivorum's greatest military victories, the city has become a monument to courage, sacrifice, and decisive leadership. Legion banners fly from every tower, triumphal arches commemorate legendary campaigns, and every citizen grows up hearing the stories of heroes who turned defeat into victory. It is the spiritual home of those who believe fortune favors the bold.",
    connections: [
      { to: "marsatum", days: 2, mode: "road" },
      { to: "minervon", days: 3, mode: "road" },
      { to: "the_rivers_gate", days: 5, mode: "road", desc: "into the treeline" },
    ],
    // Victorath's real district layout, built quarter by quarter (same
    // workflow as Arethon, Zuevaron, Aphroneth, Tritonath, Vulcaron,
    // Daedaron, Minervon, and Silvanor) — the Civic Quarter (The Triumph
    // Forum) is the first. Every place carries a `district` tag for
    // grouping in cmdLook/cmdPlaces; the Triumph Forum itself is the
    // district's own walkable hub, so it doesn't need one. Victorath
    // replaces the existing "victolath" stub — near-identical name, same
    // situation as Tritonath/Tritoneth, confirmed by the user as another
    // accidental letter-swap during reference-pulling. Its prior danger
    // level and services (rest, guild) are preserved; terrain stays
    // "plains" since the new lore doesn't specify otherwise.
    sublocations: {
      triumphForum: {
        name: "The Triumph Forum",
        type: "street",
        district: "Civic Quarter (The Triumph Forum)",
        description:
          "The administrative heart of Victorath, where military tradition shapes civic life.",
      },
      victorsGate: {
        name: "The Victor's Gate",
        type: "gate",
        district: "Civic Quarter (The Triumph Forum)",
        description:
          "A monumental gate adorned with reliefs depicting the city's founding victory.",
      },
      hallOfTriumph: {
        name: "Hall of Triumph",
        type: "landmark",
        district: "Civic Quarter (The Triumph Forum)",
        description:
          "The seat of Victorath's Ascendus senator and the city's administrative authority.",
      },
      victoryPlaza: {
        name: "Victory Plaza",
        type: "street",
        district: "Civic Quarter (The Triumph Forum)",
        description:
          "A grand public square where military parades, commemorations, and civic celebrations are held.",
      },
      victorsLedger: {
        name: "The Victor's Ledger",
        type: "board",
        district: "Civic Quarter (The Triumph Forum)",
        description:
          "Posts military commissions, escort contracts, bounty notices, reconnaissance missions, and civic requests.",
      },
      legionnairesWard: {
        name: "Legionnaire's Ward",
        type: "residential",
        district: "Civic Quarter (The Triumph Forum)",
        description:
          "Home to decorated veterans, active officers, and families whose service spans generations.",
      },
      crownVigilisHeadquarters: {
        name: "Crown Vigilis Headquarters",
        type: "barracks",
        district: "Civic Quarter (The Triumph Forum)",
        description:
          "The headquarters of Victorath's city watch and civil administration.",
      },
      // ------------------------------------------------ COMMERCIAL QUARTER
      crownMarket: {
        name: "Crown Market",
        type: "street",
        district: "Commercial Quarter (Crown Market)",
        description:
          "Commerce here serves soldiers, veterans, and travelers alike.",
      },
      victorsSupply: {
        name: "The Victor's Supply",
        type: "market",
        district: "Commercial Quarter (Crown Market)",
        description:
          "Carries expedition equipment, military provisions, and quality travel goods.",
      },
      crownforge: {
        name: "Crownforge",
        type: "shop",
        district: "Commercial Quarter (Crown Market)",
        shopCategory: "weapons",
        description:
          "Famous for producing finely balanced swords, polearms, and officer weapons worthy of champions.",
      },
      goldenShield: {
        name: "The Golden Shield",
        type: "shop",
        district: "Commercial Quarter (Crown Market)",
        shopCategory: "armor",
        description:
          "Crafts ceremonial armor alongside battle-tested equipment for seasoned Legionnaires.",
      },
      fortunesFlask: {
        name: "Fortune's Flask",
        type: "shop",
        district: "Commercial Quarter (Crown Market)",
        shopCategory: "potions",
        description:
          "Produces battlefield medicines, endurance tonics, and restorative elixirs.",
      },
      victoryStables: {
        name: "Victory Stables",
        type: "landmark",
        district: "Commercial Quarter (Crown Market)",
        description:
          "Maintains swift cavalry horses and dependable courier mounts.",
      },
      laureledLion: {
        name: "The Laureled Lion",
        type: "inn",
        district: "Commercial Quarter (Crown Market)",
        description:
          "A celebrated inn where veterans recount campaigns and young recruits dream of earning their own glory.",
      },
      triumphTreasury: {
        name: "Triumph Treasury",
        type: "landmark",
        district: "Commercial Quarter (Crown Market)",
        description:
          "Provides secure financial services for officers, merchants, and visiting dignitaries.",
      },
      merchantLegionGuild: {
        name: "Merchant Legion Guild",
        type: "guildhall",
        district: "Commercial Quarter (Crown Market)",
        description:
          "Coordinates trade supporting Victorath's military economy.",
      },
      // ------------------------------------------------- MILITARY QUARTER
      // Source names both the district hub and its central fortress "The
      // Crown Citadel" — merged into one sublocation, same pattern as Sea
      // Bastion/Great Foundry/Engine Bastion/Command Citadel/Ranger
      // Citadel in earlier cities.
      crownCitadel: {
        name: "The Crown Citadel",
        type: "barracks",
        district: "Military Quarter (The Crown Citadel)",
        description:
          "The military soul of Victorath — the city's immense fortress and headquarters of its Legion command.",
      },
      hallOfVictors: {
        name: "Hall of Victors",
        type: "landmark",
        district: "Military Quarter (The Crown Citadel)",
        description:
          "A chamber preserving battle honors, campaign records, and the names of legendary commanders.",
      },
      legionBarracks: {
        name: "Legion Barracks",
        type: "barracks",
        district: "Military Quarter (The Crown Citadel)",
        description:
          "Housing for Victorath's standing Legion garrison.",
      },
      fieldOfChampions: {
        name: "Field of Champions",
        type: "barracks",
        district: "Military Quarter (The Crown Citadel)",
        description:
          "Training grounds emphasizing aggressive tactics, dueling, and coordinated battlefield maneuvers.",
      },
      crownArsenal: {
        name: "Crown Arsenal",
        type: "landmark",
        district: "Military Quarter (The Crown Citadel)",
        description:
          "Stores weapons, armor, standards, and military equipment.",
      },
      legionCommand: {
        name: "Legion Command",
        type: "landmark",
        district: "Military Quarter (The Crown Citadel)",
        description:
          "Coordinates regional military operations and officer deployments.",
      },
      houseOfValor: {
        name: "House of Valor",
        type: "healer",
        district: "Military Quarter (The Crown Citadel)",
        description:
          "Provides care for wounded soldiers while honoring those who gave everything in service.",
      },
      triumphTower: {
        name: "Triumph Tower",
        type: "landmark",
        district: "Military Quarter (The Crown Citadel)",
        description:
          "A commanding watchtower crowned by the city's ever-flying Legion standard.",
      },
      // ------------------------------------------------- RELIGIOUS QUARTER
      sacredPrecinct: {
        name: "The Sacred Precinct",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "The people of Victorath look to Veylana, believing that destiny is shaped by courage, resolve, and the willingness to seize the decisive moment.",
      },
      grandTempleOfVeylana: {
        name: "The Grand Temple of Veylana",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Veylana"],
        description:
          "The foremost sanctuary dedicated to Veylana in Sanguivorum. Commanders seek guidance before campaigns, while victorious soldiers return to offer gratitude for fortune's favor.",
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
          "Provides lodging for pilgrims, veterans, and travelers.",
      },
      houseOfFaithful: {
        name: "House of the Faithful",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Residence of Victorath's clergy.",
      },
      gardenOfFortune: {
        name: "Garden of Fortune",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Veylana"],
        description:
          "A peaceful memorial garden celebrating hope, destiny, and those whose courage changed history.",
      },
      sacredArchives: {
        name: "Sacred Archives",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Preserves sacred texts, military blessings, and records of historic victories.",
      },
      // ----------------------------------------------------- ARCANE QUARTER
      crownConclave: {
        name: "The Crown Conclave",
        type: "guildhall",
        district: "Arcane Quarter (The Crown Conclave)",
        description:
          "The Kabal's regional headquarters studies battlefield magic, probability, and tactical arcana.",
      },
      crownConclaveHall: {
        name: "Crown Conclave Hall",
        type: "landmark",
        district: "Arcane Quarter (The Crown Conclave)",
        description:
          "Official headquarters of the Kabal within Victorath.",
      },
      registryOfBattleMages: {
        name: "Registry of Battle Mages",
        type: "landmark",
        district: "Arcane Quarter (The Crown Conclave)",
        description:
          "Registers military spellcasters and licensed magical specialists.",
      },
      chamberOfFortune: {
        name: "Chamber of Fortune",
        type: "landmark",
        district: "Arcane Quarter (The Crown Conclave)",
        description:
          "Focuses on battlefield coordination, tactical spellcraft, and magical support.",
      },
      archiveOfCampaigns: {
        name: "Archive of Campaigns",
        type: "landmark",
        district: "Arcane Quarter (The Crown Conclave)",
        description:
          "Maintains magical records of famous battles and military research.",
      },
      mageQuarters: {
        name: "Mage Quarters",
        type: "residential",
        district: "Arcane Quarter (The Crown Conclave)",
        description:
          "Housing for Conclave instructors and military mages.",
      },
      victoryCircle: {
        name: "Victory Circle",
        type: "landmark",
        district: "Arcane Quarter (The Crown Conclave)",
        description:
          "Reserved for sanctioned magical transportation.",
      },
      // ------------------------------------------------------ TRADE QUARTER
      victoryExchange: {
        name: "Victory Exchange",
        type: "street",
        district: "Trade Quarter (Victory Exchange)",
        description:
          "A logistical district ensuring the city's military remains ready.",
      },
      legionGate: {
        name: "Legion Gate",
        type: "gate",
        district: "Trade Quarter (Victory Exchange)",
        description:
          "Primary entrance for military caravans and official convoys.",
      },
      militaryCustoms: {
        name: "Military Customs",
        type: "landmark",
        district: "Trade Quarter (Victory Exchange)",
        description:
          "Inspects supplies destined for regional forts and Legions.",
      },
      victoryWarehouses: {
        name: "Victory Warehouses",
        type: "landmark",
        district: "Trade Quarter (Victory Exchange)",
        description:
          "Stores provisions, weapons, uniforms, and reserve equipment.",
      },
      quartermasterHall: {
        name: "Quartermaster Hall",
        type: "landmark",
        district: "Trade Quarter (Victory Exchange)",
        description:
          "Coordinates military logistics throughout the surrounding region.",
      },
      supplyOffice: {
        name: "Supply Office",
        type: "landmark",
        district: "Trade Quarter (Victory Exchange)",
        description:
          "Oversees transportation and distribution of essential resources.",
      },
      caravanYard: {
        name: "Caravan Yard",
        type: "landmark",
        district: "Trade Quarter (Victory Exchange)",
        description:
          "A staging area for supply trains and merchant caravans.",
      },
      // ----------------------------------------------------- ARTISAN QUARTER
      laurelsWard: {
        name: "Laurels Ward",
        type: "street",
        district: "Artisan Quarter (Laurels Ward)",
        description:
          "Master craftsmen create equipment worthy of heroes.",
      },
      victorsForge: {
        name: "Victor's Forge",
        type: "shop",
        district: "Artisan Quarter (Laurels Ward)",
        shopCategory: "weapons",
        description:
          "Produces masterwork weapons commissioned for champions, officers, and distinguished adventurers.",
      },
      stoneOfTriumph: {
        name: "Stone of Triumph",
        type: "landmark",
        district: "Artisan Quarter (Laurels Ward)",
        description:
          "Constructs monuments, memorials, and military architecture.",
      },
      standardWeaver: {
        name: "Standard Weaver",
        type: "landmark",
        district: "Artisan Quarter (Laurels Ward)",
        description:
          "Produces Legion banners, ceremonial cloaks, and formal military attire.",
      },
      medalwrightHall: {
        name: "Medalwright Hall",
        type: "shop",
        district: "Artisan Quarter (Laurels Ward)",
        shopCategory: "jewelry",
        description:
          "Crafts medals, signet rings, ceremonial decorations, and officer insignia.",
      },
      championsWorkshop: {
        name: "Champion's Workshop",
        type: "landmark",
        district: "Artisan Quarter (Laurels Ward)",
        description:
          "Produces custom military equipment and commemorative works.",
      },
      legionCarpenter: {
        name: "Legion Carpenter",
        type: "landmark",
        district: "Artisan Quarter (Laurels Ward)",
        description:
          "Builds wagons, siege equipment, bridges, and military infrastructure.",
      },
      // --------------------------------------------------- NOBLE QUARTER
      victorsHeights: {
        name: "Victor's Heights",
        type: "residential",
        district: "Noble Quarter (Victor's Heights)",
        description:
          "Home to Victorath's commanders, decorated heroes, and respected civic leaders.",
      },
      houseOfVictor: {
        name: "House of the Victor",
        type: "landmark",
        district: "Noble Quarter (Victor's Heights)",
        description:
          "Residence of Victorath's Ascendus senator.",
      },
      heroesEstates: {
        name: "Hero's Estates",
        type: "residential",
        district: "Noble Quarter (Victor's Heights)",
        description:
          "Homes of distinguished generals, decorated veterans, and influential families.",
      },
      embassyHall: {
        name: "Embassy Hall",
        type: "residential",
        district: "Noble Quarter (Victor's Heights)",
        description:
          "Hosts diplomatic representatives and military observers.",
      },
      gardenOfHeroes: {
        name: "Garden of Heroes",
        type: "landmark",
        district: "Noble Quarter (Victor's Heights)",
        description:
          "A beautifully maintained memorial honoring those whose actions secured the Empire's greatest victories.",
      },
      hallOfLaurels: {
        name: "Hall of Laurels",
        type: "landmark",
        district: "Noble Quarter (Victor's Heights)",
        description:
          "The Empire's highest civic hall for recognizing acts of extraordinary courage and leadership.",
      },
      commandersCircle: {
        name: "Commander's Circle",
        type: "landmark",
        district: "Noble Quarter (Victor's Heights)",
        description:
          "An exclusive gathering place where generals, governors, and honored veterans share strategy and fellowship.",
      },
      // ------------------------------------------------ CITY LANDMARKS
      crownOfVictory: {
        name: "The Crown of Victory",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A colossal triumphal arch commemorating the battle that gave Victorath its name.",
      },
      eternalStandard: {
        name: "The Eternal Standard",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A towering Legion banner that is never lowered, representing the enduring spirit of Sanguivorum.",
      },
      heroesWalk: {
        name: "Hero's Walk",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A grand boulevard lined with statues of the Empire's greatest champions.",
      },
      fieldOfTriumph: {
        name: "The Field of Triumph",
        type: "landmark",
        district: "City Landmarks",
        description:
          "The preserved battlefield where Victorath's defining victory was won, now serving as both memorial and place of study.",
      },
      // ------------------------------------------------- EXPLORATION LOCATIONS
      // Standalone and unsafe, same structure as the other cities' batches
      // — the ruined stronghold and the ancient crypt get "ruin" for
      // skeleton/zombie/animated-armor encounters alongside the bandit/
      // hired-blade "urban" pool. The Old Encampment, The Victory Trail,
      // Scout Command, and Hero's Summit are all preserved/still-active
      // maintained sites rather than actual ruins, so they stay "urban"
      // only.
      fallenFortress: {
        name: "The Fallen Fortress",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "The ruined enemy stronghold captured during Victorath's founding campaign, now hiding forgotten passages and lingering dangers.",
      },
      championsCrypt: {
        name: "Champion's Crypt",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "The burial place of legendary heroes, protected by ancient wards and sacred tradition.",
      },
      oldEncampment: {
        name: "The Old Encampment",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "The preserved remains of the Legion camp from the city's founding battle.",
      },
      victoryTrail: {
        name: "The Victory Trail",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A commemorative route following the decisive movements of the historic campaign.",
      },
      scoutCommand: {
        name: "Scout Command",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A forward command post dispatching reconnaissance missions, patrols, and frontier investigations.",
      },
      heroesSummit: {
        name: "Hero's Summit",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A high ridge overlooking Victorath and the historic battlefield, offering one of the most inspiring views in western Sanguivorum.",
      },
    },
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
      { to: "victorath", days: 5, mode: "road" },
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
