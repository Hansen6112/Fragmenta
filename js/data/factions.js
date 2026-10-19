/*
 * FRAGMENTA — Factions & Reputation
 * Every entity the world can have an opinion of you about: the six
 * nation-level powers (five nations plus the Kabal, which is sovereign
 * territory rather than a nation but functions the same way here) and the
 * two continental mercenary guilds.
 *
 * Reputation is a -100..100 meter per faction, stored on state.reputation.
 * Starting values come from the chosen Origin's qualitative map
 * (data/origins.js `reputation: { factionId: "friendly"|"cold"|"hostile" }`)
 * converted through QUALITATIVE_TO_NUMERIC. During play, EVERY change goes
 * through adjustReputation below (job/contract rewards and failures,
 * temple prayer, quest outcomes) — never write state.reputation directly.
 */

const FACTIONS = {
  sanguivorum: { name: "Sanguivorum", kind: "nation" },
  vaeloris: { name: "Vaeloris", kind: "nation" },
  sahrimor: { name: "Sahrimor", kind: "nation" },
  thraekor: { name: "Thraekor", kind: "nation" },
  norrvael: { name: "Norrvael", kind: "nation" },
  kabal: { name: "The Gods' Hand Kabal", kind: "nation" },
  mugamiir_safor: {
    name: "The Mugamiir Safor",
    kind: "guild",
    blurb:
      "The largest adventuring guild on the continent, headquartered in Nocthera. Founded 130 years ago by the survivors of the first serious Black Sands expedition, who came back carrying an amethyst-headed, star-metal-hafted axe and founded the guild around it. They predate Sahrimor as a formal nation — a continental organization that happens to be headquartered there, not a Sahrimor institution that operates continentally.",
  },
  magma_hearth: {
    name: "The Magma-Hearth Guild",
    kind: "guild",
    blurb:
      "Thraekor's mercenary institution, headquartered at Vorreth — formally independent of the clans, though expected to support confederation wars at a steep discount rather than for free. Smaller and younger than the Mugamiir Safor, with a geographic edge in northern and eastern markets and a reputation built on heavy infantry and siege specialists. The rivalry between the two guilds is commercial, not personal — both know exactly how good the other is at the same job.",
  },
  // The twelve gods of the Pantheon (see data/sets.js's Divine Regalia sets,
  // each already tied to one of these names) — reputation here is a small,
  // repeatable trickle from praying at a temple (see engine/parser.js
  // cmdPray), completely separate from the Sanctuary's divineFavor scalar
  // used for ally revival, even where the god is the same one (Mortasha).
  god_aelthyr: { name: "Aelthyr", kind: "god" },
  god_mortasha: { name: "Mortasha", kind: "god" },
  god_veylana: { name: "Veylana", kind: "god" },
  god_karmhal: { name: "Kar'Mhal", kind: "god" },
  god_ithrien: { name: "Ithrien", kind: "god" },
  god_seressa: { name: "Seressa", kind: "god" },
  god_nystros: { name: "Nystros", kind: "god" },
  god_xalaxar: { name: "Xalaxar", kind: "god" },
  god_aethyra: { name: "Aethyra", kind: "god" },
  god_pyreith: { name: "Pyreith", kind: "god" },
  god_aqualis: { name: "Aqualis", kind: "god" },
  god_chronaeus: { name: "Chronaeus", kind: "god" },
};

function godFactionId(godName) {
  return Object.keys(FACTIONS).find((id) => FACTIONS[id].kind === "god" && FACTIONS[id].name === godName);
}

function pantheonGodNames() {
  return Object.values(FACTIONS)
    .filter((f) => f.kind === "god")
    .map((f) => f.name);
}

// Strips everything but letters so "karmhal", "kar mhal", and "kar'mhal"
// all still match "Kar'Mhal" — every god name here is a single word (at
// most with an apostrophe), so there's no real word boundary to preserve
// the way travel.js's normalizeName keeps spaces for multi-word places.
function normalizeGodName(s) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function findGodByName(query) {
  if (!query) return null;
  const q = normalizeGodName(query);
  if (!q) return null;
  const gods = pantheonGodNames();
  return gods.find((g) => normalizeGodName(g) === q) || gods.find((g) => normalizeGodName(g).includes(q)) || null;
}

// Starting qualitative labels (from ORIGINS[].reputation, data/origins.js)
// map to a numeric seed; "neutral" / unlisted factions default to 0.
const QUALITATIVE_TO_NUMERIC = {
  hostile: -55,
  cold: -20,
  neutral: 0,
  // Was 35 — which lands in the "Recognized" band (11..40), and
  // reputationFor() collapses Recognized to "neutral". So every Origin's
  // "friendly" relationship behaved exactly like neutral in every
  // flavor/talk/encounter check. 45 sits inside "Trusted", the only band
  // reputationFor() reports as "friendly". (Alternative fix: map
  // Recognized -> "friendly" in reputationFor instead — Tyler's call.)
  friendly: 45,
};

// -100..100, five bands. Kept simple and reusable for both display and any
// future gameplay gating (service refusal, discounts, etc).
const REPUTATION_TIERS = [
  { min: -100, max: -41, label: "Hostile" },
  { min: -40, max: -11, label: "Distrusted" },
  { min: -10, max: 10, label: "Neutral" },
  { min: 11, max: 40, label: "Recognized" },
  { min: 41, max: 100, label: "Trusted" },
];

function reputationTier(value) {
  // Round and clamp first: the band edges are integers, so 10.5 or -150
  // used to fall through every band and silently read as "Neutral".
  const v = Number.isFinite(value) ? Math.max(-100, Math.min(100, Math.round(value))) : 0;
  return (REPUTATION_TIERS.find((t) => v >= t.min && v <= t.max) || REPUTATION_TIERS[2]).label;
}

// The ONE place reputation changes during play. Validates the faction id
// (a typo'd id used to silently create a brand-new key), clamps to
// -100..100, and emits "reputation.changed" so later systems (multi-ending
// bookkeeping, tier-crossing narration, achievements) can listen instead of
// being wired into every call site. Returns the delta actually applied
// after clamping.
function adjustReputation(state, factionId, delta, source) {
  if (!FACTIONS[factionId]) {
    console.error(`Fragmenta: adjustReputation called with unknown faction "${factionId}" (source: ${source || "?"})`);
    return 0;
  }
  const amount = Number(delta);
  if (!Number.isFinite(amount) || amount === 0) return 0;
  const before = Number.isFinite(state.reputation[factionId]) ? state.reputation[factionId] : 0;
  const after = Math.max(-100, Math.min(100, before + amount));
  state.reputation[factionId] = after;
  if (after !== before) {
    Events.emit("reputation.changed", { state, factionId, before, after, delta: after - before, source: source || "unknown" });
  }
  return after - before;
}

// Collapses the numeric meter down to the coarse "friendly"/"cold"/
// "hostile"/"neutral" vocabulary the parser's flavor/rest/encounter logic
// already checks against, so existing call sites didn't need to change
// when reputation went from a static per-background label to a live meter.
function reputationFor(state, factionId) {
  const value = (state.reputation && state.reputation[factionId]) || 0;
  const tier = reputationTier(value);
  if (tier === "Trusted") return "friendly";
  if (tier === "Distrusted") return "cold";
  if (tier === "Hostile") return "hostile";
  return "neutral";
}

function initialReputation(bgReputationMap) {
  const rep = {};
  for (const key of Object.keys(FACTIONS)) rep[key] = 0;
  if (bgReputationMap) {
    for (const [factionId, qualitative] of Object.entries(bgReputationMap)) {
      if (FACTIONS[factionId]) rep[factionId] = QUALITATIVE_TO_NUMERIC[qualitative] ?? 0;
    }
  }
  return rep;
}
