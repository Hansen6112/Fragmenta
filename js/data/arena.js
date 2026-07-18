/*
 * FRAGMENTA — The Grand Ovum (Arena)
 * Data for the arena side activity at Zuevaron's Grand Ovum (world.js
 * already describes it: "the greatest arena in Fragmenta. Champions,
 * beasts, tournaments, and imperial spectacles are held within its
 * colossal walls" — this file and engine/arena.js are what actually
 * builds that). Ovum Reputation ("Fame" below) is a hidden 0-100 tracker,
 * separate from the nation Reputation system (engine/state.js's own
 * `reputation` field) — never shown as a raw number to the player, only
 * through the rank it's crossed into.
 *
 * The four Legendary ("arena") and two Mythic ("arena_champion") items
 * already authored in data/items.js were placed there specifically for
 * this system (see that file's own comments — "no matching game system
 * yet") — ARENA_LOOT_POOL/ARENA_CHAMPION_LOOT_POOL below (engine/arena.js)
 * are what finally puts them in play.
 */

// Ordered low -> high. Champion is deliberately NOT just "reputation >=
// some number" — it's a distinct final rank, only reached by actually
// defeating the Champion NPC (engine/arena.js's concludeArenaFight),
// which itself only becomes available once repThreshold for Crimson is
// crossed. tierIndex feeds gladiator/beast difficulty scaling.
const ARENA_RANKS = [
  { id: "copper", name: "Copper", repThreshold: 0, tierIndex: 0 },
  { id: "bronze", name: "Bronze", repThreshold: 10, tierIndex: 1 },
  { id: "iron", name: "Iron", repThreshold: 22, tierIndex: 2 },
  { id: "steel", name: "Steel", repThreshold: 36, tierIndex: 3 },
  { id: "silver", name: "Silver", repThreshold: 52, tierIndex: 4 },
  { id: "gold", name: "Gold", repThreshold: 68, tierIndex: 5 },
  { id: "crimson", name: "Crimson", repThreshold: 84, tierIndex: 6 },
  { id: "champion", name: "Champion", repThreshold: 100, tierIndex: 7 },
];

// Flavor titles a generated gladiator's name is dressed with, scaled to
// the CURRENT rank being fought at (engine/arena.js's generateGladiator)
// — not the gladiator's own tierIndex, which already governs their stats.
const GLADIATOR_TITLES = {
  copper: ["Copper Recruit", "Sand-Ring Hopeful", "First-Blood Novice"],
  bronze: ["Bronze Brawler", "Ring-Tested Fighter", "Second Circle Duelist"],
  iron: ["Iron Veteran", "Hardened Combatant", "Iron Ring Mainstay"],
  steel: ["Steel Duelist", "Crowd's Favorite", "Steel-Ring Contender"],
  silver: ["Silver Blade", "Undefeated Silver", "Silver Circle Champion"],
  gold: ["Gold Ring Master", "Imperial Gold Fighter", "Gilded Duelist"],
  crimson: ["Crimson Executioner", "Blood-Ring Sovereign", "Crimson Terror"],
  champion: ["Champion's Own", "The Undefeated", "Grand Ovum Elite"],
};

const BEAST_FIGHT_ANNOUNCE = [
  "The gate opposite yours grinds upward. Something considerably larger than a person is on the other side of it.",
  "The crowd's roar changes pitch — they can smell what's coming through the far gate before you can see it.",
  "Chains rattle somewhere below the sand. Whatever they're releasing, it isn't happy about the chains.",
];

// The Game Master — the arena's actual master of ceremonies, the one who
// decides who fights whom and when. Met at Zuevaron's Grand Ovum
// (engine/arena.js's maybeTalkToGameMaster).
const GAME_MASTER = {
  name: "the Game Master",
  greetingFirstTime:
    `A broad-shouldered woman in a blood-red overseer's coat looks you over without any particular hurry, the way a butcher looks over livestock. "New face. New face in the Ovum usually means one of two things — you're lost, or you want to fight." She doesn't wait for you to answer which. "Everyone starts Copper. Win, and I'll move you up. Lose, and the healers earn their keep — nobody dies in my ring unless the bout is billed as one. Say the word if you want in."`,
  greetingReturning: `The Game Master gives you the barest nod — she's already sizing up your next opponent. "Back again. Good. Say the word whenever you're ready."`,
  championLocked: `"You want the Champion? Earn Crimson first. He doesn't step into the ring for anyone still climbing."`,
  championUnlocked: `"Crimson, eh." For the first time, something like real interest crosses the Game Master's face. "Then you're ready for him. Whether he's ready for you is his problem, not mine. Say 'fight champion' if your nerve's still where it was a minute ago."`,
  // Shown after the Champion's fate is resolved one way or the other
  // (recruited, or declined) — engine/arena.js's maybeTalkToGameMaster
  // picks between the two based on whether he's actually in the party.
  championRecruited: `"Took him off my hands, did you," the Game Master says, almost approving. "Good. He was getting soft, winning the same fight over and over."`,
  championGone: `"He's long gone from the Ovum," she says, not quite hiding what that costs the gate receipts. "You made your choice. So did he."`,
};

// The Champion — the top of the Ovum's ranks, and (per engine/allies.js's
// ALLY_DEFS convention) the second recruitable ally, gated on actually
// beating him rather than a quest or reputation threshold like Kessa.
const ARENA_CHAMPION = {
  id: "the_champion",
  name: "Corvath Ilesse",
  title: "The Undefeated",
  tagline: "the Grand Ovum's reigning Champion, undefeated in eleven years of bouts",
  description:
    "Eleven years in the Ovum and not one loss on record — not because he's never been hurt, but because he's never once let hurt decide anything for him. He fights like the outcome was settled before the gate opened, and it usually was.",
  hp: 60,
  atk: 14,
  def: 11,
  spd: 9,
  acc: 8,
  agi: 8,
  // Ally stat growth (engine/state.js recomputeAllyStats) uses the same
  // flat-mod-plus-growth shape as Kessa — these ARE the recruited-ally
  // numbers, distinct from the combat-encounter stats above (which scale
  // instead through the normal arena difficulty formula, engine/arena.js).
  allyStats: {
    atkMod: 4, defMod: 2, healthMod: 8, accuracyMod: 3, agilityMod: 2, speedMod: 2,
    growth: { atk: 0.9, def: 0.5, health: 2.6, accuracy: 0.35, agility: 0.3, speed: 0.25 },
  },
};
