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
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    type: "gate",
    danger: 1,
    services: ["rest", "shop", "healer"],
    description:
      "The capital of Sanguivorum, where the river forks toward the Kabal Tower. Senate banners hang from Ingenum-cut stone, and every citizen you pass walks like they're being graded on it.",
    connections: [
      { to: "kabal_tower", days: 4, mode: "road" },
      { to: "arethon", days: 3, mode: "road" },
      { to: "apollyon", days: 2, mode: "road" },
      { to: "tritoneth", days: 6, mode: "road", desc: "north into the tundra" },
    ],
    sublocations: {
      tavern: {
        name: "The Bronze Ledger",
        type: "inn",
        description:
          "A tidy inn named, everyone assumes, for the Senate's own accounting rooms — a joke the innkeeper never confirms or denies. Off-duty clerks and Legion pay-officers share the long tables, comparing whose posting is worse.",
      },
      market: {
        name: "The Ingenum Concourse",
        type: "market",
        description:
          "A colonnaded market built to Ingenum specification, every stall the same width, every awning the same red. Efficient to a fault — you can find anything here in under a minute, and no one will chat with you while you look.",
      },
      senateSteps: {
        name: "The Senate Steps",
        type: "landmark",
        description:
          "Wide Ingenum-cut steps facing the Senate house, where citizens read the day's postings aloud to whoever's within earshot — half news, half performance. \"A citizen is a tool that knows itself,\" someone always mutters, like it's supposed to be comforting.",
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
    danger: 1,
    services: ["rest", "shop", "guild"],
    description:
      "The knowledge city. Guild Historia keeps its archive here, floor after floor of Sanguivorum's official memory — and, if the rumors that never quite die are true, a rather different memory kept somewhere the guild doesn't advertise.",
    connections: [
      { to: "arethon", days: 2, mode: "road" },
      { to: "zuevaron", days: 2, mode: "road" },
      { to: "vulcaron", days: 3, mode: "road" },
      { to: "minervon", days: 3, mode: "road" },
    ],
  },
  tritoneth: {
    name: "Tritoneth",
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    danger: 2,
    services: ["rest", "shop"],
    description:
      "A tundra city at the empire's northern edge, where the meadows give up and turn to permafrost. Summer caravans make good time; deep winter nearly doubles every journey and the sledges come out.",
    connections: [
      { to: "zuevaron", days: 6, mode: "road" },
      { to: "vulcaron", days: 4, mode: "road" },
    ],
  },
  vulcaron: {
    name: "Vulcaron",
    nation: "sanguivorum",
    terrain: "mountain",
    isCity: true,
    danger: 2,
    services: ["rest", "shop"],
    description:
      "A northern city under the mountain range's shadow, closer in temperament to the frontier than to Zuevaron's polish.",
    connections: [
      { to: "tritoneth", days: 4, mode: "road" },
      { to: "silvanor", days: 2, mode: "road" },
      { to: "apollyon", days: 3, mode: "road" },
    ],
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
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    danger: 1,
    services: ["rest", "shop"],
    description: "A studious little city that likes to think of itself as Apollyon's quieter cousin.",
    connections: [
      { to: "apollyon", days: 3, mode: "road" },
      { to: "decearon", days: 3, mode: "road" },
      { to: "victolath", days: 3, mode: "road" },
    ],
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
