/*
 * FRAGMENTA — Elemental Matchups
 * When a mage's damage lands on another active elemental caster (an enemy
 * mage, or the player facing one), the attacker's element is checked
 * against the defender's for a strong/weak multiplier. Fighters and
 * non-elemental creatures are unaffected — this only triggers when BOTH
 * sides of the exchange have an element in play.
 *
 * Laid out as a fixed cycle (fire -> air -> lightning -> water -> acid ->
 * earth -> force -> transportation -> back to fire) where each element
 * is strong against the next two steps around the cycle and weak against
 * the previous two, so every strongVs/weakVs pair is reciprocal by
 * construction — no element quietly beats something that also beats it.
 */

const ELEMENT_CYCLE = ["fire", "air", "lightning", "water", "acid", "earth", "force", "transportation"];

const ELEMENT_MATCHUPS = {};
ELEMENT_CYCLE.forEach((el, i) => {
  const n = ELEMENT_CYCLE.length;
  ELEMENT_MATCHUPS[el] = {
    strongVs: [ELEMENT_CYCLE[(i + 1) % n], ELEMENT_CYCLE[(i + 2) % n]],
    weakVs: [ELEMENT_CYCLE[(i - 1 + n) % n], ELEMENT_CYCLE[(i - 2 + n) % n]],
  };
});

const STRONG_MULTIPLIER = 1.3;
const WEAK_MULTIPLIER = 0.75;

// Returns the damage multiplier for `attackerElement` hitting a target whose
// active element is `defenderElement`. Either side missing (a fighter, or a
// plain non-elemental creature) means no interaction: 1 (unchanged).
// Fragmenta's 6pc set bonus raises the strong side from 1.3x to 1.5x and
// softens the weak side from 0.75x to 0.90x — checked against whichever
// side of the fight `state` belongs to (the set only helps its own wearer,
// so an enemy mage's own attacker-side multiplier is never boosted by the
// player's gear).
function elementMultiplier(state, attackerElement, defenderElement) {
  if (!attackerElement || !defenderElement) return 1;
  const m = ELEMENT_MATCHUPS[attackerElement];
  if (!m) return 1;
  const fragmentaActive = state && hasSetTier(state, "Fragmenta", 6);
  if (m.strongVs.includes(defenderElement)) return fragmentaActive ? 1.5 : STRONG_MULTIPLIER;
  if (m.weakVs.includes(defenderElement)) return fragmentaActive ? 0.9 : WEAK_MULTIPLIER;
  return 1;
}
