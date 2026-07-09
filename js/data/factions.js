/*
 * FRAGMENTA — Factions & Reputation
 * Every entity the world can have an opinion of you about: the six
 * nation-level powers (five nations plus the Kabal, which is sovereign
 * territory rather than a nation but functions the same way here) and the
 * two continental mercenary guilds.
 *
 * Reputation is a -100..100 meter per faction, stored on state.reputation.
 * Starting values come from the chosen background's qualitative map
 * (backgrounds.js `reputation: { factionId: "friendly"|"cold"|"hostile" }`)
 * converted through QUALITATIVE_TO_NUMERIC. Nothing currently adjusts it
 * during play beyond character creation — see engine/reputation.js for the
 * (for-now-unused) adjustment hook this is deliberately structured around.
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
      "Thraekor's mercenary institution, headquartered at Vorreth (Vorseth in some records) — formally independent of the clans, though expected to support confederation wars at a steep discount rather than for free. Smaller and younger than the Mugamiir Safor, with a geographic edge in northern and eastern markets and a reputation built on heavy infantry and siege specialists. The rivalry between the two guilds is commercial, not personal — both know exactly how good the other is at the same job.",
  },
};

// Starting qualitative labels (from BACKGROUNDS[].reputation) map to a
// numeric seed; "neutral" / unlisted factions default to 0.
const QUALITATIVE_TO_NUMERIC = {
  hostile: -55,
  cold: -20,
  neutral: 0,
  friendly: 35,
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
  return (REPUTATION_TIERS.find((t) => value >= t.min && value <= t.max) || REPUTATION_TIERS[2]).label;
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
