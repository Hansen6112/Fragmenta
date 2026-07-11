/*
 * FRAGMENTA — Equipment Sets
 * A second bonus layer on top of individual item bonuses/effects: pieces
 * tagged with the same `set` id in an ITEM_DEFS entry (data/items.js)
 * grant an escalating bonus at 2/4/6 (and, for Legion, 8) pieces equipped
 * simultaneously. Stored data-driven here rather than hardcoded per item —
 * adding a new set only means a SETS entry plus tagging the relevant
 * items with `set: "NewSetName"`, no engine changes for the piece-
 * counting itself.
 *
 * The flat stat bumps are fully data-driven (setStatBonus() below, folded
 * into recomputeStats alongside the per-item equipmentBonus()). The
 * named-ability bonuses are inherently bespoke — same as individual item
 * effects, this table documents what each one is and at what threshold;
 * the mechanic itself is hardcoded at its point of use in engine/
 * combat.js / engine/parser.js / engine/jobs.js / data/synergy.js /
 * data/matchups.js, gated by hasSetTier(state, setName, tier).
 *
 * MANY sets independently push the same underlying number (e.g. four
 * different sets all read "Spell Ward becomes 20%"). Rather than have
 * each one hardcode its own override at the point of use, every shared
 * number has ONE resolver function below (crushingImpactMultiplier,
 * spellWardMultiplier, etc.) that checks every contributing set and
 * takes the strongest one active — engine code calls that resolver, not
 * a specific set's tier, so adding a tenth set that also boosts Spell
 * Ward is a one-line addition to the resolver, not a new call site.
 *
 * ---- Reconciliation with the original 8-set batch ----
 * A later, larger design pass restated three sets from that batch with
 * updated numbers, which are treated as authoritative here (the batch
 * explicitly re-listed them, unlike the ~20 untouched sets it didn't
 * mention):
 *   - Legion: 2/4/6pc unchanged; 6pc's Disciplined Formation changed from
 *     a stacking +2 Attack per Feint to a one-shot +3 Defense on that
 *     same Feint's retaliation (functionally identical to Brace); a new
 *     8pc tier (Hold the Line) was added.
 *   - Lizardfolk: the flat +Health and the (inert) Corrosionproof bonus
 *     swapped tiers (Health moved to 2pc, Corrosionproof to 4pc).
 *   - Drake Hunter: 2pc's flat Attack bonus dropped from +3 to +2.
 * Kabal and Sahrimor (the original singular nation sets) were NOT
 * mentioned in the new batch and are left completely untouched, existing
 * alongside the new, more specific sets that cover similar thematic
 * ground (Novitiate/Examiner/Conduit Master/River Warden for Kabal;
 * Mugamiir Safor/Courier/Sandstrider/Tide Merchant for Sahrimor) — a
 * player can pursue either the broad nation set or the narrower one,
 * they simply compete for the same equipment slots like any two sets do.
 *
 * ---- Bonuses kept exactly as specified despite depending on effects
 * that have no live trigger yet ----
 * Same policy as data/effects.js: these are registered and will activate
 * the moment their underlying mechanic exists, not reworked into
 * something artificially "live" today.
 *   - Thraekor 2pc, Sahrimor 2pc, Norrvael 4pc, Lizardfolk 4pc (moved
 *     from 2pc), Lizardfolk 6pc — carried over from the original batch.
 *   - Ashforged 4pc (Heatproof immunity), Queen Carapace 4pc's
 *     Corrosionproof half, Canopy Ranger 6pc ("first ranged attack" —
 *     there's no ranged/melee distinction anywhere in this engine, so
 *     this is inert pending that system too, not just a missing-mechanic
 *     effect).
 *
 * ---- One genuinely new mechanic per set, everything else reuses the
 * resolver-function pattern above ----
 * hold_the_line, vanguard_momentum, heartwood_vitality, storm_barrier,
 * carapace_adaptation, and bleed_exploitation are the six effects this
 * batch actually required new code for (see data/effects.js) — plus a few
 * more bespoke one-shot mechanics that weren't given a formal effect id
 * (Legion 6pc/8pc, Siege Corps 6pc's extra +Attack, White Watch 6pc's
 * stacking Defense, Stonewarden 6pc's first-hit reduction) documented
 * inline at their hook in engine/combat.js.
 */

const SETS = {
  // ---- Original untouched sets (first batch; not mentioned in the second
  // design pass, left exactly as originally implemented) ----
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

  // ---- Military Sets ----
  Legion: {
    theme: "Disciplined combined-arms soldiers.",
    bonuses: {
      2: { bonuses: { def: 2 }, description: "+2 Defense" },
      4: { special: "legion_shield_wall", description: "Shield Wall — all incoming damage -10%" },
      6: { special: "legion_disciplined_formation", description: "Disciplined Formation — after using Feint, +3 Defense against that same retaliation" },
      8: { effects: ["hold_the_line"], description: "Hold the Line — first time below 30% Health each fight, +6 Defense for 2 turns" },
    },
  },
  Vanguard: {
    theme: "Heavy shock infantry.",
    bonuses: {
      2: { bonuses: { atk: 2 }, description: "+2 Attack" },
      4: { special: "vanguard_crushing_135", description: "Crushing Impact deals 1.35x instead of 1.20x" },
      6: { special: "vanguard_executioner_40", description: "Executioner activates below 40% Health instead of 30%" },
    },
  },
  "Scout Corps": {
    theme: "Reconnaissance.",
    bonuses: {
      2: { bonuses: { knowledge: 2 }, description: "+2 Knowledge" },
      4: { special: "scoutcorps_trailwise_20", description: "Trailwise becomes 20%" },
      6: { special: "scoutcorps_ambush_170", description: "Ambush damage increases to 1.70x" },
    },
  },
  "Siege Corps": {
    theme: "Fortification and breach warfare.",
    bonuses: {
      2: { bonuses: { def: 2 }, description: "+2 Defense" },
      4: { special: "siegecorps_armorcrack_4", description: "Armor Crack ignores 4 Defense instead of 2" },
      6: { special: "siegecorps_brace_atk", description: "Brace also grants +2 Attack next turn" },
    },
  },

  // ---- Kabal Sets ----
  Novitiate: {
    theme: "Mage-in-training.",
    bonuses: {
      2: { bonuses: { magic: 2 }, description: "+2 Magic" },
      4: { special: "novitiate_focus_112", description: "Elemental Focus becomes 1.12x" },
      6: { special: "novitiate_free_first_cast", description: "First elemental spell each fight has no cooldown" },
    },
  },
  Examiner: {
    theme: "Kabal Tower bureaucracy and oversight.",
    bonuses: {
      2: { bonuses: { knowledge: 2 }, description: "+2 Knowledge" },
      4: { special: "examiner_spellward_20", description: "Spell Ward becomes 20%" },
      6: { special: "examiner_tacticalmemory_50", description: "Tactical Memory triggers at 50% instead of 20%" },
    },
  },
  "Conduit Master": {
    theme: "Advanced River-conduit control.",
    bonuses: {
      2: { bonuses: { magic: 3 }, description: "+3 Magic" },
      4: { special: "conduitmaster_ease_40", description: "Conduit Ease becomes 40%" },
      6: { special: "conduitmaster_surging_twice", description: "Surging Conduit triggers twice each fight" },
    },
  },
  "River Warden": {
    theme: "Wardens of the Kabal's river control.",
    bonuses: {
      2: { bonuses: { def: 2 }, description: "+2 Defense" },
      4: { special: "riverwarden_spellward_20", description: "Spell Ward becomes 20%" },
      6: { special: "riverwarden_resist_magic", description: "+2 Magic every time you resist magical damage (max +8)" },
    },
  },

  // ---- Guild Sets ----
  "Mugamiir Safor": {
    theme: "Sahrimor's mercenary/adventuring guild.",
    bonuses: {
      2: { bonuses: { knowledge: 2 }, description: "+2 Knowledge" },
      4: { special: "mugamiirsafor_merchantseye_10", description: "Merchant's Eye becomes 10% (currently inert — no shop system yet)" },
      6: { special: "mugamiirsafor_contract_10", description: "Guild contract gold rewards +10%" },
    },
  },
  Courier: {
    theme: "Professional message- and cargo-runners.",
    bonuses: {
      2: { bonuses: { knowledge: 2 }, description: "+2 Knowledge" },
      4: { special: "courier_trailwise_20", description: "Trailwise becomes 20%" },
      6: { special: "courier_travel_75", description: "Random travel encounters reduced by 25% (relative)" },
    },
  },
  "Contract Hunter": {
    theme: "Bounty and contract specialists.",
    bonuses: {
      2: { bonuses: { atk: 2 }, description: "+2 Attack" },
      4: { special: "contracthunter_executioner_40", description: "Executioner threshold becomes 40% Health" },
      6: { effects: ["vanguard_momentum"], description: "Vanguard Momentum — +1 Attack after defeating an enemy (stacks to +5, this fight only)" },
    },
  },
  "Master Appraiser": {
    theme: "Elite valuers of Sahrimori goods.",
    bonuses: {
      2: { bonuses: { knowledge: 2 }, description: "+2 Knowledge" },
      4: { special: "masterappraiser_merchantseye_15", description: "Merchant's Eye becomes 15% (currently inert — no shop system yet)" },
      6: { special: "masterappraiser_loot_120", description: "Monster loot drop chance +20% (relative)" },
    },
  },

  // ---- Cultural Sets ----
  Ashforged: {
    theme: "Thraekor's ash-forged smiths and soldiers.",
    bonuses: {
      2: { bonuses: { def: 2 }, description: "+2 Defense" },
      4: { special: "ashforged_heatproof_immunity", description: "Heatproof becomes full Burn immunity (currently inert — nothing burns the player yet)" },
      6: { special: "ashforged_crushing_140", description: "Crushing Impact becomes 1.40x" },
    },
  },
  Stonewarden: {
    theme: "Dwarven bulwarks.",
    bonuses: {
      2: { bonuses: { def: 2 }, description: "+2 Defense" },
      4: { special: "stonewarden_brace_5", description: "Brace grants +5 Defense instead of +3" },
      6: { special: "stonewarden_first_hit_75", description: "The first hit you take each fight deals 25% less damage" },
    },
  },
  Heartwood: {
    theme: "Vaeloris's living-wood regeneration.",
    bonuses: {
      2: { bonuses: { health: 2 }, description: "+2 Health" },
      4: { special: "heartwood_regrowth_10", description: "Regrowth heals 10% instead of 5%" },
      6: { effects: ["heartwood_vitality"], description: "Heartwood Vitality — heal 2% max Health every third action" },
    },
  },
  "Canopy Ranger": {
    theme: "Vaeloris's canopy scouts.",
    bonuses: {
      2: { bonuses: { knowledge: 2 }, description: "+2 Knowledge" },
      4: { special: "canopyranger_ambushsense_50", description: "Ambush Sense becomes 50% (currently inert — no enemy-ambush mechanic yet)" },
      6: { special: "canopyranger_ranged_130", description: "First ranged attack deals +30% (currently inert — no ranged/melee distinction exists)" },
    },
  },
  Sandstrider: {
    theme: "Sahrimor's desert wayfinders.",
    bonuses: {
      2: { bonuses: { knowledge: 2 }, description: "+2 Knowledge" },
      4: { special: "sandstrider_heatproof_trailwise", description: "Grants Heatproof (currently inert) and Trailwise outright" },
      6: { special: "sandstrider_contract_10", description: "Merchant's Eye also boosts guild contract gold +10%" },
    },
  },
  "Tide Merchant": {
    theme: "Coastal trading houses.",
    bonuses: {
      2: { bonuses: { knowledge: 2 }, description: "+2 Knowledge" },
      4: { special: "tidemerchant_merchantseye_10", description: "Merchant's Eye becomes 10% (currently inert — no shop system yet)" },
      6: { special: "tidemerchant_jobgold_5", description: "All job/contract gold rewards +5%" },
    },
  },
  Stormwatch: {
    theme: "Norrvael's storm-mist sentries.",
    bonuses: {
      2: { bonuses: { def: 2 }, description: "+2 Defense" },
      4: { special: "stormwatch_spellward_20", description: "Spell Ward becomes 20%" },
      6: { effects: ["storm_barrier"], description: "Storm Barrier — first magical hit received each fight deals half damage" },
    },
  },
  "White Watch": {
    theme: "Duelist-honor guard.",
    bonuses: {
      2: { bonuses: { atk: 2 }, description: "+2 Attack" },
      4: { special: "whitewatch_riposte_75", description: "Riposte damage becomes 0.75x instead of 0.5x" },
      6: { special: "whitewatch_riposte_def", description: "Successful Ripostes grant +2 Defense (stacking, rest of fight)" },
    },
  },

  // ---- Creature Sets ----
  Lizardfolk: {
    theme: "Poison, adaptation, natural armor.",
    bonuses: {
      2: { bonuses: { health: 2 }, description: "+2 Health" },
      4: { special: "lizardfolk_corrosionproof_full", description: "Corrosionproof fully negates Corrode's Defense reduction (currently inert — nothing corrodes the player yet)" },
      6: { effects: ["marsh_survivor"], description: "Marsh Survivor — Bleed damage taken -50% (currently inert — Bleed only ever afflicts the enemy)" },
    },
  },
  "Drake Hunter": {
    theme: "Monster hunting, rare drops.",
    bonuses: {
      2: { bonuses: { atk: 2 }, description: "+2 Attack" },
      4: { special: "drakehunter_executioner_40", description: "Executioner threshold becomes 40% Health" },
      6: { effects: ["dragonslayer"], description: "Dragonslayer — +20% damage against creatures tagged draven" },
    },
  },
  "Queen Carapace": {
    theme: "Armor grown from an unnamed queen's shell.",
    bonuses: {
      2: { bonuses: { def: 3 }, description: "+3 Defense" },
      4: { special: "queencarapace_corrosionproof_stalwart", description: "Grants Corrosionproof and Stalwart outright (both currently inert)" },
      6: { effects: ["carapace_adaptation"], description: "Carapace Adaptation — +3 Defense each time you're hit (max +9, resets each fight)" },
    },
  },
  "Elder Bark": {
    theme: "The oldest living wood in Vaeloris.",
    bonuses: {
      2: { bonuses: { health: 2 }, description: "+2 Health" },
      4: { special: "elderbark_regrowth_10", description: "Regrowth heals 10% instead of 5%" },
      6: { special: "elderbark_survive_1hp", description: "Survive one fatal hit each fight with 1 Health (once)" },
    },
  },
  Bonecaller: {
    theme: "Those who speak for the swamp's dead.",
    bonuses: {
      2: { bonuses: { atk: 2 }, description: "+2 Attack" },
      4: { special: "bonecaller_deepcut_35", description: "Deep Cut chance becomes 35% instead of 20%" },
      6: { effects: ["bleed_exploitation"], description: "Bleed Exploitation — +20% damage to enemies currently Bleeding" },
    },
  },
  Leviathan: {
    theme: "Deep-water predators.",
    bonuses: {
      2: { bonuses: { def: 2 }, description: "+2 Defense" },
      4: { special: "leviathan_coldproof_spellward", description: "Grants Coldproof and Spell Ward outright" },
      6: { special: "leviathan_water_heal_75", description: "Water spells heal 75% of damage dealt instead of 50%" },
    },
  },

  // ---- Ancient Sets ----
  "First Kingdom": {
    theme: "The continent's first recorded civilization.",
    bonuses: {
      2: { bonuses: { knowledge: 2 }, description: "+2 Knowledge" },
      4: { special: "firstkingdom_tacticalmemory_50", description: "Tactical Memory triggers at 50% instead of 20%" },
      6: { special: "firstkingdom_cooldowns", description: "Every tactic's cooldown is reduced by 1 turn" },
    },
  },
  "Pre-Kabal": {
    theme: "Magic from before the Kabal's founding.",
    bonuses: {
      2: { bonuses: { magic: 2 }, description: "+2 Magic" },
      4: { special: "prekabal_focus_120", description: "Elemental Focus becomes 1.20x" },
      6: { special: "prekabal_generic_synergy_140", description: "Generic elemental synergy combinations gain 40% instead of 25%" },
    },
  },
  Fragmenta: {
    theme: "Shards of the shattered god's horn.",
    bonuses: {
      2: { bonuses: { magic: 2 }, description: "+2 Magic" },
      4: { special: "fragmenta_surging_twice", description: "Surging Conduit triggers twice each fight" },
      6: { special: "fragmenta_matchups_150", description: "Elemental matchup strengths become 1.50x and weaknesses improve to 0.90x" },
    },
  },

  // ---- Divine Regalia (tier 8) — one 6-piece set per god ----
  "Regalia of the First Bloom": {
    theme: "Aelthyr's gifts to those who tend rather than take.",
    god: "Aelthyr",
    bonuses: {
      2: { effects: ["blessing_of_renewal"], description: "Blessing of Renewal — restore 3% max Health at the start of every round" },
      4: { effects: ["overflowing_life"], description: "Overflowing Life — healing beyond full Health becomes Temporary Health, up to 30% max Health" },
      6: { effects: ["avatar_of_bloom"], description: "Avatar of Bloom — once per combat, dropping below 25% Health instantly heals 50% max Health, cleanses negative status effects, and grants +25% Attack/Magic/Defense for 3 rounds" },
    },
  },
  "Regalia of the Final Veil": {
    theme: "Mortasha's gifts to those who guide the dead onward.",
    god: "Mortasha",
    bonuses: {
      2: { effects: ["blessing_of_acceptance"], description: "Blessing of Acceptance — negative status durations on you are reduced by 1 round" },
      4: { effects: ["mercy_of_the_veil"], description: "Mercy of the Veil — the first time each combat you fall below 40% Health, remove every negative status effect" },
      6: { effects: ["avatar_of_passing"], description: "Avatar of Passing — once per combat, dropping below 25% Health grants 4 rounds where all damage dealt heals you for 30%" },
    },
  },
  "Regalia of the Woven Thread": {
    theme: "Veylana's gifts to those who read fate before it lands.",
    god: "Veylana",
    bonuses: {
      2: { effects: ["blessing_of_guidance"], description: "Blessing of Guidance — the first attack or spell each combat gains +25% Critical Chance" },
      4: { effects: ["threads_of_consequence"], description: "Threads of Consequence — whenever an enemy misses you, your next attack deals 40% additional damage" },
      6: { effects: ["avatar_of_fate"], description: "Avatar of Fate — once per combat, dropping below 25% Health grants 4 rounds of doubled Critical Damage and a one-time 1-HP save" },
    },
  },
  "Regalia of the Crimson Vanguard": {
    theme: "Kar'Mhal's gifts to those who never yield the field.",
    god: "Kar'Mhal",
    bonuses: {
      2: { effects: ["blessing_of_valor"], description: "Blessing of Valor — your opening attack deals +30% damage, healing 15% max Health if it's a kill" },
      4: { effects: ["commanding_presence"], description: "Commanding Presence — every 3rd attack fully ignores the target's Defense" },
      6: { effects: ["avatar_of_war"], description: "Avatar of War — once per combat, dropping below 25% Health grants 4 rounds of +50% Attack, 10% lifesteal, and expanded Riposte" },
    },
  },
  "Regalia of the Endless Archive": {
    theme: "Ithrien's gifts to those who never stop learning.",
    god: "Ithrien",
    bonuses: {
      2: { effects: ["blessing_of_insight"], description: "Blessing of Insight — +20% Critical spell chance; enemy elemental weaknesses revealed at combat start" },
      4: { effects: ["universal_understanding"], description: "Universal Understanding — every elemental cast randomly reduces another element's cooldown by 2" },
      6: { effects: ["avatar_of_knowledge"], description: "Avatar of Knowledge — once per combat, dropping below 25% Health grants 4 rounds of free spellcasting, +50% Magic, and improved elemental matchups" },
    },
  },
  "Regalia of the Eternal Heart": {
    theme: "Seressa's gifts to those who love without limit.",
    god: "Seressa",
    bonuses: {
      2: { effects: ["blessing_of_compassion"], description: "Blessing of Compassion — all healing received is increased by 25%" },
      4: { effects: ["heartward_bond"], description: "Heartward Bond — granting yourself a beneficial effect also grants +2 Attack/+2 Magic/+2 Defense for its duration" },
      6: { effects: ["avatar_of_devotion"], description: "Avatar of Devotion — once per combat, dropping below 25% Health grants 4 rounds of doubled healing and 35% reduced damage taken, with a follow-up heal after any cheat-death save" },
    },
  },
  "Regalia of the Laughing Gale": {
    theme: "Nystros's gifts to those who court chance itself.",
    god: "Nystros",
    bonuses: {
      2: { effects: ["blessing_of_fortune"], description: "Blessing of Fortune — every critical hit grants +5% Critical Chance, capped at +25%" },
      4: { effects: ["twist_of_fate"], description: "Twist of Fate — whenever this set's own randomness favors you, restore 5% Health and ease a random cooldown by 1 turn" },
      6: { effects: ["avatar_of_chaos"], description: "Avatar of Chaos — once per combat, dropping below 25% Health grants 4 rounds of randomized damage, doubled Critical Chance, and a random stat burst on every crit" },
    },
  },
  "Regalia of the Eternal Bastion": {
    theme: "Xalaxar's gifts to those who do not break.",
    god: "Xalaxar",
    bonuses: {
      2: { effects: ["blessing_of_stone"], description: "Blessing of Stone — 15% Damage Reduction whenever Health is above 50%" },
      4: { effects: ["walls_endure"], description: "Walls Endure — each hit taken grants +1 Defense, capped at +20, resetting after combat" },
      6: { effects: ["avatar_of_endurance"], description: "Avatar of Endurance — once per combat, dropping below 25% Health grants 4 rounds of halved damage taken, +50% healing received, and a stat burst on every hit taken" },
    },
  },
  "Regalia of the Endless Horizon": {
    theme: "Aethyra's gifts to those who never stop moving.",
    god: "Aethyra",
    bonuses: {
      2: { effects: ["blessing_of_freedom"], description: "Blessing of Freedom — 15% Evasion chance; evading an attack restores 5% Health" },
      4: { effects: ["ever_forward"], description: "Ever Forward — three different action types in a row grants +10 Attack/+10 Magic for 3 rounds" },
      6: { effects: ["avatar_of_freedom"], description: "Avatar of Freedom — once per combat, dropping below 25% Health grants 4 rounds of +50% Evasion, doubled cooldown recovery, and unrestricted Ability/Tactic use" },
    },
  },
  "Regalia of the Eternal Forge": {
    theme: "Pyreith's gifts to those who forge themselves anew.",
    god: "Pyreith",
    bonuses: {
      2: { effects: ["blessing_of_creation"], description: "Blessing of Creation — temporary stat bonuses you gain are increased by 25%" },
      4: { effects: ["perfected_craft"], description: "Perfected Craft — every equipped passive may activate one additional time per combat" },
      6: { effects: ["avatar_of_creation"], description: "Avatar of Creation — once per combat, dropping below 25% Health grants 4 rounds of +40% Attack/+40% Magic, doubled cooldown recovery, and permanent +2 Attack per attack/+2 Magic per spell" },
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

/*
 * ---- Shared resolver functions ----
 * Each of these is the SINGLE place a given number is decided, checked by
 * every set that touches it. Engine code calls these, never a specific
 * set's hasSetTier directly, for anything more than one set overrides.
 */

// Crushing Impact's damage multiplier: base 1.2x; Thraekor 6pc, Vanguard
// 4pc, and Ashforged 6pc each push it higher — take the strongest active.
function crushingImpactMultiplier(state) {
  let m = 1.2;
  if (hasSetTier(state, "Thraekor", 6)) m = Math.max(m, 1.35);
  if (hasSetTier(state, "Vanguard", 4)) m = Math.max(m, 1.35);
  if (hasSetTier(state, "Ashforged", 6)) m = Math.max(m, 1.4);
  return m;
}

// Executioner's HP threshold: base 30%; Drake Hunter 4pc, Vanguard 6pc,
// and Contract Hunter 4pc all widen it to 40% — same value, just OR'd.
function executionerThreshold(state) {
  if (hasSetTier(state, "Drake Hunter", 4) || hasSetTier(state, "Vanguard", 6) || hasSetTier(state, "Contract Hunter", 4)) return 0.4;
  return 0.3;
}

// Trailwise's travel-encounter multiplier. Sandstrider 4pc grants the
// base effect outright (no item needed); Sahrimor/Scout Corps/Courier
// 4pc push it to 0.8, and Courier 6pc further to 0.75.
function trailwiseMultiplier(state) {
  const hasBase = hasEffect(state, "trailwise") || hasSetTier(state, "Sandstrider", 4);
  if (!hasBase) return 1;
  let mult = 0.9;
  if (hasSetTier(state, "Sahrimor", 4) || hasSetTier(state, "Scout Corps", 4) || hasSetTier(state, "Courier", 4)) mult = Math.min(mult, 0.8);
  if (hasSetTier(state, "Courier", 6)) mult = Math.min(mult, 0.75);
  return mult;
}

// Spell Ward's incoming-elemental-damage multiplier. Leviathan 4pc grants
// the base effect outright; Examiner/River Warden/Stormwatch 4pc push it
// from 0.9 to 0.8.
function spellWardMultiplier(state) {
  const hasBase = hasEffect(state, "spell_ward") || hasSetTier(state, "Leviathan", 4);
  if (!hasBase) return 1;
  if (hasSetTier(state, "Examiner", 4) || hasSetTier(state, "River Warden", 4) || hasSetTier(state, "Stormwatch", 4)) return 0.8;
  return 0.9;
}

// Tactical Memory's proc chance: base 20% (only relevant if the item
// effect is equipped); Examiner 6pc and First Kingdom 4pc push it to 50%.
function tacticalMemoryChance(state) {
  if (hasSetTier(state, "Examiner", 6) || hasSetTier(state, "First Kingdom", 4)) return 0.5;
  return 0.2;
}

// Conduit Ease's proc chance: base 20%; Kabal 6pc and Conduit Master 4pc
// push it to 40%.
function conduitEaseChance(state) {
  if (hasSetTier(state, "Kabal", 6) || hasSetTier(state, "Conduit Master", 4)) return 0.4;
  return 0.2;
}

// Elemental Focus's damage multiplier: base 1.08x; Novitiate/Kabal/
// Pre-Kabal 4pc each push it higher — take the strongest active.
function elementalFocusMultiplier(state) {
  let m = 1.08;
  if (hasSetTier(state, "Novitiate", 4)) m = Math.max(m, 1.12);
  if (hasSetTier(state, "Kabal", 4)) m = Math.max(m, 1.15);
  if (hasSetTier(state, "Pre-Kabal", 4)) m = Math.max(m, 1.2);
  return m;
}

// Surging Conduit's per-fight charge count: base 1; Conduit Master 6pc
// and Fragmenta 4pc both raise it to 2 (not 3, if somehow both active).
function surgingConduitCharges(state) {
  return (hasSetTier(state, "Conduit Master", 6) || hasSetTier(state, "Fragmenta", 4)) ? 2 : 1;
}

// Ambush's damage multiplier: base 1.4x, 1.55x with the ambush_mastery
// item effect, 1.70x with Scout Corps 6pc (which wins outright).
function ambushMultiplier(state) {
  if (hasSetTier(state, "Scout Corps", 6)) return 1.7;
  return hasEffect(state, "ambush_mastery") ? 1.55 : 1.4;
}

// Armor Crack's flat Defense ignored: base 2 (only relevant with the item
// effect equipped); Siege Corps 4pc doubles it to 4.
function armorCrackAmount(state) {
  if (!hasEffect(state, "armor_crack")) return 0;
  return hasSetTier(state, "Siege Corps", 4) ? 4 : 2;
}

// Brace's Defense bonus for that single retaliation: base 3 (only
// relevant with the item effect equipped); Stonewarden 4pc raises it to 5.
function braceDefBonus(state) {
  if (!hasEffect(state, "brace")) return 0;
  return hasSetTier(state, "Stonewarden", 4) ? 5 : 3;
}

// Riposte's damage multiplier: base 0.5x; White Watch 4pc raises it to 0.75x.
function riposteMultiplier(state) {
  return hasSetTier(state, "White Watch", 4) ? 0.75 : 0.5;
}

// Regrowth's heal percentage: base 5%; Vaeloris/Heartwood/Elder Bark 4pc
// all raise it to 10%.
function regrowthHealPct(state) {
  if (hasSetTier(state, "Vaeloris", 4) || hasSetTier(state, "Heartwood", 4) || hasSetTier(state, "Elder Bark", 4)) return 0.1;
  return 0.05;
}

// Deep Cut's proc chance: base 20% (only relevant with the item effect
// equipped); Bonecaller 4pc raises it to 35%.
function deepCutChance(state) {
  if (!hasEffect(state, "deep_cut")) return 0;
  return hasSetTier(state, "Bonecaller", 4) ? 0.35 : 0.2;
}

// Job/contract gold reward multiplier — several sets stack additively
// here rather than override each other, since each targets a distinct
// or overlapping-but-not-identical scope (Sahrimor/Tide Merchant apply to
// everything; Mugamiir Safor/Sandstrider only to guild contracts).
function jobGoldMultiplier(state, job) {
  let mult = 1;
  if (hasSetTier(state, "Sahrimor", 6)) mult += 0.1;
  if (hasSetTier(state, "Tide Merchant", 6)) mult += 0.05;
  if (job.kind === "guild") {
    if (hasSetTier(state, "Mugamiir Safor", 6)) mult += 0.1;
    if (hasSetTier(state, "Sandstrider", 6)) mult += 0.1;
  }
  return mult;
}

// Coldproof's +2 Defense vs Water-elemental attacks, grantable outright
// by Leviathan 4pc without needing the item effect equipped.
function hasColdproof(state) {
  return hasEffect(state, "coldproof") || hasSetTier(state, "Leviathan", 4);
}

// Torrent (Water)'s self-heal percentage of damage dealt: base 50%;
// Leviathan 6pc raises it to 75%.
function waterHealPct(state) {
  return hasSetTier(state, "Leviathan", 6) ? 0.75 : 0.5;
}
