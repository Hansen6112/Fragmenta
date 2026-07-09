/*
 * FRAGMENTA — Lexicon & Procedural Generation
 * Built from the Ancient Languages Reference (Vaur'eth & Keth-Rakar).
 * Used to generate NPC names, place-flavor, and item names on the fly so
 * exploration never runs out of world to describe.
 */

const VAURETH = {
  consonants: ["V", "N", "R", "S", "W", "M", "L", "Th", "Dh", "Kh"],
  vowels: ["au", "ae", "o", "ua", "ei"],
  endings: ["n", "r", "l", ""], // "" = ends in vowel
  roots: [
    "Vaur", "Sael", "Nori", "Mauth", "Thuel", "Rau", "Druith", "Aelun", "Voreth", "Kaul",
    "Daun", "Mael", "Voran", "Sulei", "Orvae", "Luaen", "Nauren", "Thoren", "Wraelu", "Sorvae",
    "Awen", "Nauri", "Soru", "Vaelin", "Thauln", "Maelor", "Ruven", "Dwaelu", "Aunel", "Kaeven",
    "Saur", "Nael", "Voruin", "Rauven", "Thaun", "Druven", "Solaen", "Varath",
  ],
  affixes: {
    plural: "aun",
    negation: "sul-",
    belonging: "or",
    trueFinal: "rau-",
    persistence: "uin",
  },
};

const KETHRAKAR = {
  consonants: ["K", "G", "D", "R", "Th", "V", "Z", "Sk", "Kr", "Dr", "Gh"],
  vowels: ["a", "e", "i"],
  roots: [
    "Keth", "Drak", "Velth", "Skarr", "Ravek", "Zeth", "Greth", "Valdrek", "Skorn", "Athek",
    "Kradom", "Vethrak", "Skardim", "Threk", "Gethak", "Draven", "Karveth", "Zathrim", "Skelrak", "Valdrim",
    "Akem", "Zarak", "Skrel", "Vathim", "Drekan", "Gathek", "Karvim", "Skeldim", "Draveth",
  ],
  affixes: {
    plural: "ak",
    negation: "veth-",
    belonging: "im",
    completedPast: "drak-",
  },
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate a Vaur'eth-style name: soft, breath-shaped, ends in vowel or n/r/l
function generateVauretName() {
  const root1 = pick(VAURETH.roots);
  const root2 = pick(VAURETH.roots);
  if (root1 === root2) return capitalize(root1 + pick(["ael", "or", "uin", "en"]));
  const joiner = Math.random() < 0.5 ? "-" : "";
  return capitalize(root1) + joiner + root2.toLowerCase();
}

// Generate a Keth-Rakar-style name: hard, carved, ends in consonant
function generateKethrakarName() {
  const root1 = pick(KETHRAKAR.roots);
  const root2 = pick(KETHRAKAR.roots);
  if (root1 === root2) return capitalize(root1 + pick(["ak", "im", "dim", "rak"]));
  return capitalize(root1) + "-" + root2.toLowerCase();
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Nation -> preferred language register for generated names/flavor
const NATION_LANGUAGE = {
  vaeloris: "vauret",
  thraekor: "kethrakar",
  sanguivorum: "vauret",
  sahrimor: "kethrakar",
  norrvael: "kethrakar",
  kabal: "kethrakar",
};

function generateNameForNation(nation) {
  const lang = NATION_LANGUAGE[nation] || "vauret";
  return lang === "vauret" ? generateVauretName() : generateKethrakarName();
}

const DRUID_PHRASES = [
  ["Thaun.", "Enemy. Predator near."],
  ["Nael. Veth saur.", "Stranger. I see you."],
  ["Voruin. You voruin now.", "Kin. You are kin now."],
  ["The druith sueln. It knows.", "The swamp remembers."],
  ["Rau-mael. Sulei maur.", "True death. The soul walks."],
  ["Sul-daun. Not true-living.", "Something wrong with the living."],
  ["Thuel daun. It endures.", "Stone-life. It will last."],
  ["Mauth naur. Listen.", "Wind-voice. Something is being said."],
  ["Raunel. Old before the names.", "Ancient beyond reckoning."],
];

const KETHRAKAR_PHRASES = [
  ["Keth akem.", "Stone-oath — the most binding form of promise."],
  ["Velth skrel.", "Ash endures."],
  ["Skardim keth.", "Fortress of stone — an unbreakable position."],
  ["Draveth skrel.", "Legacy of endurance — the highest honor for a life well spent."],
  ["Zeth vathim.", "Darkness holds memory."],
];
