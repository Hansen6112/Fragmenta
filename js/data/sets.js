/*
 * FRAGMENTA — Equipment Sets
 * A second bonus layer on top of individual item bonuses/effects: pieces
 * tagged with the same `set` id in an ITEM_DEFS entry (data/items.js)
 * grant an escalating bonus at 2/4/6 pieces equipped simultaneously.
 * Stored data-driven here rather than hardcoded per item — adding a new
 * set only means a SETS entry plus tagging the relevant items with
 * `set: "NewSetName"`, no engine changes for the piece-counting itself.
 *
 * The 2pc/4pc bonuses that are a flat stat bump are fully data-driven
 * (setStatBonus() below, folded into recomputeStats alongside the
 * per-item equipmentBonus()). The named-ability bonuses (Shield Wall,
 * Disciplined Formation, Forgeborn, etc.) are inherently bespoke — same
 * as individual item effects, this table just documents what each one
 * is and at what threshold; the actual mechanic is hardcoded at its
 * point of use in engine/combat.js / engine/parser.js / engine/jobs.js,
 * gated by hasSetTier(state, setName, tier).
 *
 * Two sets were trimmed from their original 8-piece design down to 7/6:
 * Legion originally listed a shield AND a scutum (both Off Hand), and
 * Lizardfolk listed two different spears (both Main Hand) — since a
 * single character can never wear both same-slot pieces at once, the
 * weaker duplicate of each pair (the plain, no-effect one) was left
 * untagged rather than force an unreachable "wear all 8" set.
 *
 * A few of these bonuses amplify an item effect that has no live
 * trigger yet (Thraekor 2pc/Heatproof, Sahrimor 2pc/Merchant's Eye,
 * Norrvael 4pc/Ambush Sense, Lizardfolk 2pc/Corrosionproof, Lizardfolk
 * 6pc/Marsh Survivor) — kept exactly as designed rather than reworked,
 * consistent with how those base effects are already documented as
 * future-proofed in data/effects.js. There is deliberately no code hook
 * for these; there's nothing yet to hook into.
 */

const SETS = {
  Legion: {
    theme: "Professional soldiers.",
    bonuses: {
      2: { bonuses: { def: 2 }, description: "+2 Defense" },
      4: { special: "legion_shield_wall", description: "Shield Wall — all incoming damage -10%" },
      6: { special: "legion_disciplined_formation", description: "Disciplined Formation — +2 Attack (stacking) whenever Feint succeeds" },
    },
  },
  Vaeloris: {
    theme: "Nature, movement, knowledge.",
    bonuses: {
      2: { bonuses: { knowledge: 2 }, description: "+2 Knowledge" },
      4: { special: "vaeloris_natures_grace", description: "Nature's Grace — Regrowth heals 10% instead of 5%" },
      6: { special: "vaeloris_forest_guardian", description: "Forest Guardian — +2 Defense for your next fight whenever Regrowth activates" },
    },
  },
  Thraekor: {
    theme: "Heavy armor, fire, smithing.",
    bonuses: {
      2: { special: "thraekor_heatproof_immunity", description: "Heatproof becomes full Burn immunity (currently inert — nothing burns the player yet)" },
      4: { bonuses: { def: 3 }, description: "+3 Defense" },
      6: { special: "thraekor_forgeborn", description: "Forgeborn — Crushing Impact deals 1.35x instead of 1.20x" },
    },
  },
  Sahrimor: {
    theme: "Travel, commerce, speed.",
    bonuses: {
      2: { special: "sahrimor_merchants_eye_10", description: "Merchant's Eye becomes 10% (currently inert — no shop system yet)" },
      4: { special: "sahrimor_trailwise_20", description: "Trailwise becomes 20%" },
      6: { effects: ["master_merchant"], description: "Master Merchant — completed job/contract gold +10%" },
    },
  },
  Norrvael: {
    theme: "Precision, intelligence, ambush.",
    bonuses: {
      2: { bonuses: { atk: 2 }, description: "+2 Attack" },
      4: { special: "norrvael_ambush_sense_50", description: "Ambush Sense becomes 50% (currently inert — no enemy-ambush mechanic yet)" },
      6: { special: "norrvael_silent_hunter", description: "Silent Hunter — Opening Reach deals 1.30x instead of 1.15x" },
    },
  },
  Kabal: {
    theme: "Magic, conduits, river control.",
    bonuses: {
      2: { bonuses: { magic: 2 }, description: "+2 Magic" },
      4: { special: "kabal_elemental_focus_115", description: "Elemental Focus increases to 1.15x" },
      6: { special: "kabal_river_mastery", description: "River Mastery — Conduit Ease becomes a 40% chance instead of 20%" },
    },
  },
  Lizardfolk: {
    theme: "Poison, adaptation, natural armor.",
    bonuses: {
      2: { special: "lizardfolk_corrosionproof_full", description: "Corrosionproof fully negates Corrode's Defense reduction (currently inert — nothing corrodes the player yet)" },
      4: { bonuses: { health: 3 }, description: "+3 Health" },
      6: { effects: ["marsh_survivor"], description: "Marsh Survivor — Bleed damage taken -50% (currently inert — Bleed only ever afflicts the enemy)" },
    },
  },
  "Drake Hunter": {
    theme: "Monster hunting, rare drops.",
    bonuses: {
      2: { bonuses: { atk: 3 }, description: "+3 Attack" },
      4: { special: "drakehunter_executioner_40", description: "Executioner threshold becomes 40% HP instead of 30%" },
      6: { effects: ["dragonslayer"], description: "Dragonslayer — +20% damage against creatures tagged draven" },
    },
  },
};

// How many equipped pieces (across all slots, trinkets included) belong
// to a given set right now.
function setPieceCount(state, setName) {
  let count = 0;
  for (const slot of EQUIP_SLOTS) {
    const items = slot === "trinkets" ? state.equipment.trinkets : (state.equipment[slot] ? [state.equipment[slot]] : []);
    for (const item of items) {
      const def = ITEM_DEFS[item];
      if (def && def.set === setName) count++;
    }
  }
  return count;
}

function hasSetTier(state, setName, tier) {
  const set = SETS[setName];
  if (!set || !set.bonuses[tier]) return false;
  return setPieceCount(state, setName) >= tier;
}

// Sums flat stat bonuses from every set threshold currently met — the
// set-layer sibling to items.js's equipmentBonus().
function setStatBonus(state, statKey) {
  let total = 0;
  for (const setName of Object.keys(SETS)) {
    const count = setPieceCount(state, setName);
    for (const [tier, bonus] of Object.entries(SETS[setName].bonuses)) {
      if (count >= Number(tier) && bonus.bonuses && bonus.bonuses[statKey]) total += bonus.bonuses[statKey];
    }
  }
  return total;
}

// One line per set with at least 1 piece equipped, e.g.
// "Legion (3 pcs): 2pc +2 Defense [ACTIVE] · 4pc Shield Wall... [3 more needed]"
// Shared by the `equipment` text command and the Equipment tab UI.
function describeSetProgress(state) {
  const lines = [];
  for (const [setName, set] of Object.entries(SETS)) {
    const count = setPieceCount(state, setName);
    if (count === 0) continue;
    const tierParts = Object.entries(set.bonuses)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([tier, bonus]) => {
        const t = Number(tier);
        const active = count >= t;
        return `${tier}pc ${bonus.description}${active ? " [ACTIVE]" : ` [needs ${t - count} more]`}`;
      });
    lines.push(`${setName} (${count} pc equipped): ${tierParts.join(" · ")}`);
  }
  return lines;
}
