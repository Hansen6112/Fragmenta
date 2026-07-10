/*
 * FRAGMENTA — Elemental Synergy
 * Once a mage has both a primary and secondary element (level 15+),
 * casting one element's ability right after the OTHER known element's
 * ability triggers a synergy bonus on that cast — a reward for actively
 * alternating your two elements rather than spamming one.
 *
 * Ten thematically obvious pairs get a curated, named combo effect
 * (SYNERGY_COMBOS below). The other 18 of the 28 possible pairs fall back
 * to GENERIC_SYNERGY: a flat +25% to the ability's main damage roll and a
 * plain resonance line naming both elements.
 *
 * Resolution lives in engine/combat.js (useElementAbility): it tracks
 * state.combat.lastElementUsed, looks up the pair via getSynergy(), and
 * applies dmgMultiplier to the damage roll(s) plus extraEffect() for any
 * additional mechanical effect, before pushing the combo's message line.
 */

function pairKey(a, b) {
  return [a, b].sort().join("+");
}

const SYNERGY_COMBOS = {
  "fire+water": {
    name: "Steamveil",
    message: (target) => `Fire and water collide into a wall of scalding steam — ${target} can barely track you through it.`,
    dmgMultiplier: 1.15,
    extraEffect: (state) => {
      state.combat.evasionTurns = Math.max(state.combat.evasionTurns, 2);
    },
  },
  "air+fire": {
    name: "Wildfire",
    message: () => `The wind catches the flame and it roars up into a wildfire.`,
    dmgMultiplier: 1.1,
    extraEffect: (state) => {
      if (state.combat.burn) {
        state.combat.burn.dmgPerTurn = Math.round(state.combat.burn.dmgPerTurn * 1.5);
        state.combat.burn.turnsLeft = Math.max(state.combat.burn.turnsLeft, 2) + 1;
      } else {
        state.combat.burn = { turnsLeft: 3, dmgPerTurn: Math.max(1, Math.round(state.magic / 5)) };
      }
    },
  },
  "acid+fire": {
    name: "Corrosive Flame",
    message: (target) => `Flame and acid fuse — ${target} burns and dissolves at once.`,
    dmgMultiplier: 1.15,
    extraEffect: (state) => {
      if (!state.combat.burn) state.combat.burn = { turnsLeft: 2, dmgPerTurn: Math.max(1, Math.round(state.magic / 5)) };
      state.combat.enemyDefPenalty = (state.combat.enemyDefPenalty || 0) + 3; // stacks even if Corrode's own lock is already spent
    },
  },
  "earth+fire": {
    name: "Magma Burst",
    message: () => `Molten rock sheathes you as it sheathes them — armor and injury from the same casting.`,
    dmgMultiplier: 1.1,
    extraEffect: (state) => {
      if (!state.combat.burn) state.combat.burn = { turnsLeft: 2, dmgPerTurn: Math.max(1, Math.round(state.magic / 5)) };
      state.combat.defBuffTurns = Math.max(state.combat.defBuffTurns, 2);
      state.combat.defBuffAmount = Math.max(state.combat.defBuffAmount, Math.max(2, Math.round(state.magic / 4)));
    },
  },
  "lightning+water": {
    name: "Electrocute",
    message: (target) => `The water carries the charge through every part of ${target} at once.`,
    dmgMultiplier: 1.25,
    extraEffect: (state) => {
      state.combat.enemyStunned = true;
    },
  },
  "earth+water": {
    name: "Quagmire",
    message: (target) => `The ground turns to mud and swallows ${target}'s footing.`,
    dmgMultiplier: 1.05,
    extraEffect: (state) => {
      state.combat.enemyAtkPenalty = (state.combat.enemyAtkPenalty || 0) + 3; // stacks even if Disarm's own lock is already spent
    },
  },
  "acid+earth": {
    name: "Weathering",
    message: (target) => `Stone and acid together — ${target}'s defenses erode like a cliff face.`,
    dmgMultiplier: 1.1,
    extraEffect: (state) => {
      state.combat.enemyDefPenalty = (state.combat.enemyDefPenalty || 0) + 5;
    },
  },
  "force+transportation": {
    name: "Displacement Slam",
    message: (target) => `You arrive already swinging — ${target} is hit before it registers you've moved.`,
    dmgMultiplier: 1.3,
    extraEffect: (state) => {
      state.combat.enemyStunned = true;
    },
  },
  "force+lightning": {
    name: "Thunderclap",
    message: (target) => `Sound and force arrive on top of each other — ${target} reels from both.`,
    dmgMultiplier: 1.2,
    extraEffect: (state) => {
      state.combat.enemyStunned = true;
    },
  },
  "air+transportation": {
    name: "Windwalk",
    message: () => `You're already somewhere else by the time the air finishes moving.`,
    dmgMultiplier: 1.1,
    extraEffect: (state) => {
      state.combat.evasionTurns = Math.max(state.combat.evasionTurns, 3);
    },
  },
};

const GENERIC_SYNERGY_MULTIPLIER = 1.25;

// Pre-Kabal's 6pc set bonus raises the generic (uncurated-pair) synergy
// bonus from 25% to 40% — curated named combos (SYNERGY_COMBOS) are
// untouched, since each of those already has its own hand-picked value.
function genericSynergyMultiplier(state) {
  return hasSetTier(state, "Pre-Kabal", 6) ? 1.4 : GENERIC_SYNERGY_MULTIPLIER;
}

function genericSynergy(state, elementA, elementB) {
  const nameA = ELEMENTS[elementA].name;
  const nameB = ELEMENTS[elementB].name;
  return {
    name: null,
    message: () => `Your mastery of ${nameA} and ${nameB} resonates — this cast lands harder.`,
    dmgMultiplier: genericSynergyMultiplier(state),
    extraEffect: null,
  };
}

// Returns the synergy definition for casting `elementKey` right after
// `lastElementUsed`, or null if they're the same element, either is
// missing, or the mage doesn't actually know both (shouldn't happen in
// practice, but defends against stale combat state).
function getSynergy(state, elementKey) {
  const combat = state.combat;
  const known = [state.primaryElement, state.secondaryElement, state.tertiaryElement].filter(Boolean);
  let prev = combat.lastElementUsed;
  // River Harmony (Artifact): a synergy bonus activates on every cast,
  // regardless of what (if anything) actually came before it. Rather than
  // requiring a real alternating pairing, this pairs the current cast with
  // whichever OTHER known element exists, so the very first cast of the
  // fight (no lastElementUsed yet) and an immediate same-element repeat
  // both still resolve a real (curated or generic) combo.
  if (hasEffect(state, "river_harmony") && (!prev || prev === elementKey)) {
    prev = known.find((e) => e !== elementKey) || null;
  }
  if (!prev || prev === elementKey) return null;
  if (!known.includes(prev) || !known.includes(elementKey)) return null;
  const key = pairKey(elementKey, prev);
  return SYNERGY_COMBOS[key] || genericSynergy(state, elementKey, prev);
}
