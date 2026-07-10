/*
 * FRAGMENTA — Elements
 * Magic in Fragmenta is framed as tied to a mage's imagination more than
 * any fixed spell list — but every mage still has a primary element (and,
 * from level 15, possibly a second) that colors what their magic actually
 * looks like. This is the foundation layer: element choice, and elemental
 * flavor for the magic-driven basic attack (see engine/combat.js
 * rollPlayerDamage/attackFlavorLine). An actual elemental spell-options
 * system (the mage parallel to the Knowledge-gated fighter tactics) is a
 * natural next step once this lands — not built yet.
 */

const ELEMENTS = {
  air: {
    name: "Air",
    description: "Wind, pressure, and breath given violent shape.",
    verb: (target) => `You summon a lashing gust that slams into ${target}`,
  },
  water: {
    name: "Water",
    description: "Flow and pressure — the patient violence of water.",
    verb: (target) => `You crush ${target} beneath a coiling wave`,
  },
  fire: {
    name: "Fire",
    description: "Heat, light, and consumption.",
    verb: (target) => `You engulf ${target} in a lance of white-hot flame`,
  },
  earth: {
    name: "Earth",
    description: "Weight, permanence, the mountain's patience.",
    verb: (target) => `You drive a fist of stone up through the ground into ${target}`,
  },
  lightning: {
    name: "Lightning",
    description: "Speed, shock, the storm's temper.",
    verb: (target) => `You arc a bolt of lightning through ${target}`,
  },
  acid: {
    name: "Acid",
    description: "Dissolution, decay accelerated to violence.",
    verb: (target) => `You splash a corrosive arc of acid across ${target}`,
  },
  transportation: {
    name: "Transportation",
    description: "Distance, displacement, the space between places.",
    verb: (target) => `You wrench the space around ${target} sideways, through air that wasn't there a moment ago`,
  },
  force: {
    name: "Force",
    description: "Raw, conceptless push — the purest expression of a mage's will.",
    verb: (target) => `You drive an unseen wall of pure force into ${target}`,
  },
};

function elementList() {
  return Object.values(ELEMENTS).map((e) => e.name);
}

function findElement(query) {
  const q = (query || "").toLowerCase().trim();
  return Object.keys(ELEMENTS).find((k) => k === q || ELEMENTS[k].name.toLowerCase() === q) || null;
}
