/*
 * FRAGMENTA — Item Effects
 * A second, separate layer on top of items.js's flat stat bonuses: instead
 * of "+N to a stat," an effect is a fixed-magnitude behavioral trait an
 * item can carry (an `effects: [...]` array on an ITEM_DEFS entry,
 * alongside its usual `bonuses`). Unlike bonuses, effect magnitudes are
 * NOT tier-scaled — each effect is a single, fixed rule, exactly as
 * specified below. Presence is boolean: equipping the same effect twice
 * doesn't double it (hasEffect() only ever asks "is this equipped at
 * all?"), matching the source material's explicit non-stacking language
 * ("multiple copies do not stack", "only the strongest applies", etc.)
 * for every effect where that even comes up.
 *
 * No items in data/items.js carry an effect yet — this is the engine and
 * registry only, fully wired into engine/combat.js (and trailwise into
 * engine/parser.js's travel encounter roll). Attaching specific effects
 * to specific items is a separate authoring pass.
 *
 * A few effects describe defending against a mechanic that doesn't exist
 * anywhere in the game yet (an enemy attack-reducing an enemy stun on the
 * PLAYER, a shop economy, environmental terrain hazards). Those are
 * still registered here for completeness and future-proofing, but have
 * no live trigger today — see the inline notes below. Building out those
 * missing systems is out of scope for this pass.
 */

const EFFECT_DEFS = {
  // ---- Weapon and Combat Effects ----
  opening_reach: { name: "Opening Reach", category: "combat", description: "The first normal physical attack in a fight deals 1.15x damage. Doesn't trigger on Ambush, Blink, or elemental abilities." },
  patient_aim: { name: "Patient Aim", category: "combat", description: "Feint's empowered attack multiplier increases from 1.6x to 1.75x." },
  armor_crack: { name: "Armor Crack", category: "combat", description: "Physical attacks ignore 2 points of the target's effective Defense (the target's actual Defense is unchanged)." },
  feinting_edge: { name: "Feinting Edge", category: "combat", description: "Feint's cooldown drops from 2 turns to 1. Feint still can't be reused while its empowered strike is pending." },
  guarded_strike: { name: "Guarded Strike", category: "combat", description: "After a normal physical attack, gain +2 Defense against that enemy's immediate retaliation only." },
  riposte: { name: "Riposte", category: "combat", description: "When an enemy's retaliation deals zero damage (Decoy, evasion, or a complete miss), immediately land a free hit for 0.5x normal damage. Once per action." },
  crushing_impact: { name: "Crushing Impact", category: "combat", description: "Physical attacks deal 1.20x damage against enemies whose effective Defense exceeds your Attack." },
  deep_cut: { name: "Deep Cut", category: "combat", description: "Physical attacks have a 20% chance to apply Bleed (3 turns, refreshes rather than stacks — see the Bleed status)." },
  hamstring: { name: "Hamstring", category: "combat", description: "Your first successful physical hit permanently reduces the target's effective Attack by 1 for the fight. Once per target; stacks with Disarm/Quagmire." },
  executioner: { name: "Executioner", category: "combat", description: "Deal 1.20x damage to any target at or below 30% of its maximum Health." },
  ambush_mastery: { name: "Ambush Mastery", category: "combat", description: "Ambush's damage multiplier increases from 1.4x to 1.55x." },
  evasive_release: { name: "Evasive Release", category: "combat", description: "After using Ambush, gain one evasion charge: the next enemy retaliation has a 50% chance to miss. Expires on trigger or at combat's end." },

  // ---- Defensive Effects ----
  // stalwart and concussion_guard describe reducing an incoming Attack
  // penalty / ignoring a stun applied TO the player — no enemy ability in
  // the game currently does either (Disarm/Quagmire/Hamstring/Concuss all
  // apply their penalty/stun to the ENEMY, not the player), so both are
  // inert until a future enemy ability targets the player that way.
  stalwart: { name: "Stalwart", category: "defense", description: "The first Attack penalty applied to you each fight is reduced by 2 (minimum 0). Currently inert — nothing in the game yet reduces the player's Attack." },
  brace: { name: "Brace", category: "defense", description: "When you take a no-damage action (Feint, Stoneskin), gain +3 Defense against that same turn's retaliation." },
  evasive_guard: { name: "Evasive Guard", category: "defense", description: "Whenever an evasion effect causes a retaliation to miss, gain +1 Defense for the rest of the fight, up to +3." },
  spell_ward: { name: "Spell Ward", category: "defense", description: "Incoming elemental damage is multiplied by 0.90. Physical damage is unaffected." },
  concussion_guard: { name: "Concussion Guard", category: "defense", description: "The first stun that would affect you each fight is ignored. Currently inert — nothing in the game yet stuns the player." },
  heatproof: { name: "Heatproof", category: "defense", description: "Burn damage you take is halved (rounded down, minimum 0) — not the initial hit that applies it. Currently inert — nothing in the game yet burns the player." },
  coldproof: { name: "Coldproof", category: "defense", description: "Immunity to cold-slow effects (none exist yet). Until then, grants +2 Defense against Water-elemental attacks." },
  corrosionproof: { name: "Corrosionproof", category: "defense", description: "Defense penalties from Corrode/Corrosive Flame/Weathering that land on you are reduced by 2 — they still land, just weaker. Currently inert — those are player-cast effects; nothing in the game yet applies them to the player." },
  surefooted: { name: "Surefooted", category: "defense", description: "Ignore the first forced-movement/knockdown/terrain penalty each fight or travel event. Currently inert — no such environmental mechanic exists yet." },

  // ---- Magical Effects ----
  conduit_ease: { name: "Conduit Ease", category: "magic", description: "Each time an elemental ability is cast, 20% chance its cooldown begins 1 turn shorter (minimum 1)." },
  elemental_focus: { name: "Elemental Focus", category: "magic", description: "Elemental abilities deal 1.08x damage. Stoneskin instead gets +1 additional Defense, since it deals no damage." },
  surging_conduit: { name: "Surging Conduit", category: "magic", description: "The first elemental ability used each fight deals 1.20x damage. Stoneskin instead gets +3 additional Defense." },
  regrowth: { name: "Regrowth", category: "magic", description: "After combat ends, restore 5% of max Health (rounded up). Multiple copies don't stack." },
  unsettling: { name: "Unsettling", category: "magic", description: "At the start of a fight, 20% chance the enemy begins with -2 Attack for the whole fight." },

  // ---- Knowledge, Economy, and Exploration Effects ----
  tactical_memory: { name: "Tactical Memory", category: "utility", description: "Once per fight, the first time a tactic (Feint/Decoy/Disarm) enters cooldown, 20% chance to immediately cut that cooldown by 1 (minimum 1)." },
  ambush_sense: { name: "Ambush Sense", category: "utility", description: "Reduces the chance of hostile creatures getting an opening ambush on you by 25%. Currently inert — no enemy-ambush mechanic exists yet." },
  trailwise: { name: "Trailwise", category: "utility", description: "Reduces the chance of a negative random travel encounter by 10% (relative). Doesn't affect scripted or quest-tied encounters." },
  merchants_eye: { name: "Merchant's Eye", category: "utility", description: "Shop purchase prices -5%, sale prices +5%. Currently inert — no shop/buy/sell system exists yet." },

  // ---- Set-only bonuses (data/sets.js) — never appear on an item's own
  // `effects` array; granted purely by reaching a set's 6-piece threshold.
  // Documented here alongside the rest for a single reference point.
  master_merchant: { name: "Master Merchant", category: "set", description: "Sahrimor set (6pc). Completed job/contract gold rewards +10%. Applies once regardless of how many set pieces you have." },
  marsh_survivor: { name: "Marsh Survivor", category: "set", description: "Lizardfolk set (6pc). Incoming Bleed damage -50% (rounded down, minimum 1). Currently inert — Bleed (Deep Cut) only ever afflicts the enemy, never the player." },
  dragonslayer: { name: "Dragonslayer", category: "set", description: "Drake Hunter set (6pc). Deal 1.20x damage against creatures tagged draven (Drake, Dragon) — a final multiplier applied after all other damage calculations." },
  hold_the_line: { name: "Hold the Line", category: "set", description: "Legion set (8pc). The first time your Health falls below 30% each fight, immediately gain +6 Defense for 2 turns." },
  vanguard_momentum: { name: "Vanguard Momentum", category: "set", description: "Contract Hunter set (6pc). After defeating an enemy, gain +1 Attack for the remainder of that fight (stacks to +5, resets each new fight)." },
  heartwood_vitality: { name: "Heartwood Vitality", category: "set", description: "Heartwood set (6pc). Every third combat action you take, restore 2% of max Health." },
  storm_barrier: { name: "Storm Barrier", category: "set", description: "Stormwatch set (6pc). The first magical attack you receive each fight deals half damage." },
  carapace_adaptation: { name: "Carapace Adaptation", category: "set", description: "Queen Carapace set (6pc). Gain +3 Defense each time you're hit, up to +9, reset at the start of each fight." },
  bleed_exploitation: { name: "Bleed Exploitation", category: "set", description: "Bonecaller set (6pc). Deal 1.20x damage to an enemy currently affected by Bleed." },

  // ---- Legendary-exclusive effects (data/items.js tier 5) ----
  // Passives reserved for Legendary-tier gear only — none appear on any
  // lower tier. Three describe mechanics with no existing analog in the
  // game (an Elite/Boss creature classification for Kingslayer works off
  // creature.tier>=4 / creature.unique as the closest proxy and IS live;
  // Unbreakable and Iron Will need a player-facing Defense-reduction/stun
  // mechanic that doesn't exist anywhere yet, and Overwhelming Force is
  // explicitly designed for multi-enemy fights, which this engine doesn't
  // have — all three are registered and inert until those systems exist,
  // same policy as the inert effects above.
  kingslayer: { name: "Kingslayer", category: "legendary", description: "Deal +25% damage against Elite and Boss enemies (creature tier 4+, or a unique/named creature)." },
  last_stand: { name: "Last Stand", category: "legendary", description: "The first time you would die each fight, survive at 1 Health and gain +5 Attack for the remainder of the fight." },
  rivers_favor: { name: "River's Favor", category: "legendary", description: "Your first elemental ability each fight has no cooldown." },
  unbreakable: { name: "Unbreakable", category: "legendary", description: "Ignore the first Defense reduction applied to you each fight. Currently inert — nothing in the game yet reduces the player's Defense." },
  blood_debt: { name: "Blood Debt", category: "legendary", description: "Each enemy killed restores 20% of your max Health." },
  perfect_balance: { name: "Perfect Balance", category: "legendary", description: "Whenever your Attack and Defense are within 2 points of each other, gain +2 to both during combat." },
  momentum: { name: "Momentum", category: "legendary", description: "Consecutive attacks deal +10% more damage each, up to +50%. Resets at the start of each fight." },
  spell_echo: { name: "Spell Echo", category: "legendary", description: "20% chance for an elemental ability's damage to immediately repeat at 50% power." },
  hunters_instinct: { name: "Hunter's Instinct", category: "legendary", description: "Deal +30% damage on your first action of each fight." },
  iron_will: { name: "Iron Will", category: "legendary", description: "Immune to Stun effects. Currently inert — nothing in the game yet stuns the player." },
  overwhelming_force: { name: "Overwhelming Force", category: "legendary", description: "Excess damage beyond a kill carries over to another enemy. Currently inert — this engine only ever has one enemy per fight; future-proofed for multi-enemy combat." },
  master_duelist: { name: "Master Duelist", category: "legendary", description: "Enemy counterattacks (physical and elemental alike) deal 25% less damage." },

  // ---- Mythic-exclusive effects (data/items.js tier 6) ----
  // Build-defining passives reserved for Mythic-tier gear. Second Wind is
  // the one inert entry: it describes gaining an extra action after
  // defeating an enemy mid-combat, but this engine ends a fight the
  // instant its one enemy dies (no multi-wave/multi-enemy encounters
  // exist), so there is never a moment for that extra action to happen —
  // same "no matching system yet" policy as Overwhelming Force.
  second_wind: { name: "Second Wind", category: "mythic", description: "Once per combat, immediately gain another action after defeating an enemy. Currently inert — this engine ends a fight the instant its one enemy dies; there's no multi-enemy encounter for the extra action to happen in." },
  arcane_overflow: { name: "Arcane Overflow", category: "mythic", description: "Elemental ability damage rolls are boosted an additional 50%." },
  conduit_mastery: { name: "Conduit Mastery", category: "mythic", description: "Every elemental ability's cooldown is reduced by 1 turn (minimum 1), applied before Conduit Ease/Novitiate's free-cast logic." },
  perfect_timing: { name: "Perfect Timing", category: "mythic", description: "Your first tactic (Feint/Decoy/Disarm) each fight ignores its cooldown entirely." },
  living_steel: { name: "Living Steel", category: "mythic", description: "Gain +1 Attack and +1 Defense every 3rd combat action, up to +5/+5. Resets each fight." },
  soul_leech: { name: "Soul Leech", category: "mythic", description: "Every hit you land restores 10% of the damage dealt as Health." },
  temporal_echo: { name: "Temporal Echo", category: "mythic", description: "Every 5th combat action deals double damage." },
  adaptive_ward: { name: "Adaptive Ward", category: "mythic", description: "The first elemental hit you take each fight grants resistance to that element for the rest of the fight (later hits of that element deal 50% damage)." },
  twin_rivers: { name: "Twin Rivers", category: "mythic", description: "Any elemental cast made right after another one this fight deals +40% damage, regardless of whether the pairing has a curated or generic synergy bonus." },
  execution_protocol: { name: "Execution Protocol", category: "mythic", description: "Deal 2x damage to any target at or below 20% of its maximum Health." },
  guardian_spirit: { name: "Guardian Spirit", category: "mythic", description: "The first enemy attack each fight automatically misses." },
  master_strategist: { name: "Master Strategist", category: "mythic", description: "Every tactic's cooldown is reduced by 1 turn — the same flat reduction First Kingdom's 6pc set bonus grants, from an item effect instead." },

  // ---- Artifact Effects ----
  // One tier above Mythic. Three of these (immutable, fatewoven,
  // titans_endurance) describe defending against a mechanic that simply
  // doesn't exist anywhere in this engine: nothing ever applies a negative
  // status effect to the PLAYER, the player's own attacks never have a
  // "failure" state to reroll (damage is always at least 1, with no
  // miss/dodge check on outgoing hits), and state.def itself (the value
  // these bonuses build on top of) is never reduced by anything — so
  // there's nothing for any of the three to actually guard against. They're
  // registered for completeness but are inert, the same category of
  // limitation as unbreakable/iron_will/overwhelming_force/second_wind.
  dual_focus: { name: "Dual Focus", category: "artifact", description: "Equip one additional Trinket (3 instead of 2)." },
  master_of_arms: { name: "Master of Arms", category: "artifact", description: "Main-hand weapon passives trigger twice if applicable: Kingslayer/Hunter's Instinct/Execution Protocol/Arcane Overflow/Temporal Echo's bonus doubles, Spell Echo's proc chance doubles, and Blood Debt/Soul Leech's heal percentage doubles — only when that specific passive is on the equipped Main Hand item itself, and only for passives with a well-defined 'doubled' meaning." },
  arcane_convergence: { name: "Arcane Convergence", category: "artifact", description: "Every elemental cast rolls its base damage twice and keeps the higher result." },
  immutable: { name: "Immutable", category: "artifact", description: "Negative combat effects cannot be applied to you. Currently inert — nothing in this engine ever applies a negative status effect to the player in the first place." },
  battle_scholar: { name: "Battle Scholar", category: "artifact", description: "Gain +1 Knowledge, permanently, after every combat victory (capped at +50 total)." },
  perfect_recall: { name: "Perfect Recall", category: "artifact", description: "Tactics (Feint/Decoy/Disarm) no longer have cooldowns." },
  conduit_ascendant: { name: "Conduit Ascendant", category: "artifact", description: "You may learn one additional element beyond the normal two-element limit, once you already know both a primary and secondary element ('choose <element>' to open it)." },
  living_legacy: { name: "Living Legacy", category: "artifact", description: "Gain +1 permanent max Health after defeating an Elite-or-stronger enemy (capped at +100 total)." },
  mirror_soul: { name: "Mirror Soul", category: "artifact", description: "The first hostile spell cast against you each combat is reflected back at the caster instead of landing on you." },
  echoing_arsenal: { name: "Echoing Arsenal", category: "artifact", description: "Every 5th weapon (physical) attack strikes for double damage." },
  world_walker: { name: "World Walker", category: "artifact", description: "Blink becomes usable regardless of class or known elements." },
  fatewoven: { name: "Fatewoven", category: "artifact", description: "Once per combat, automatically reroll any failed attack. Currently inert — the player's own attacks in this engine always deal at least 1 damage; there's no miss/failure state on an outgoing hit to reroll." },
  titans_endurance: { name: "Titan's Endurance", category: "artifact", description: "Defense can never fall below its base value. Currently inert — nothing in this engine ever reduces the player's base Defense; every combat modifier is an additive bonus layered on top of it, never a subtraction from it." },
  river_harmony: { name: "River Harmony", category: "artifact", description: "Elemental synergy bonuses activate on every cast, regardless of what (if anything) was cast right before it." },
  empty_hand: { name: "The Empty Hand", category: "artifact", description: "Fighting with no Off-Hand equipped grants +50% Attack and +25% Defense." },

  // ---- Divine Regalia (per-god item passives, data/items.js tier 8) ----
  living_current: { name: "Living Current", category: "regalia", description: "Whenever you restore Health, gain +2 Magic until the end of combat (stacks up to +10)." },
  rooted_resolve: { name: "Rooted Resolve", category: "regalia", description: "The first time your Health falls below 50% each combat, immediately gain +8 Defense for 3 rounds." },
  flourishing_soul: { name: "Flourishing Soul", category: "regalia", description: "Healing you receive from any source is increased by 50%." },
  seedbearer: { name: "Seedbearer", category: "regalia", description: "Every 3rd elemental cast restores 10% of your maximum Health." },
  natures_persistence: { name: "Nature's Persistence", category: "regalia", description: "The first crowd-control effect (Stun, Disarm, etc.) applied to you each combat is ignored. Currently inert — nothing in this engine applies crowd control to the player; enemies have no abilities or actions of their own yet. Expected to come alive once enemies are reworked with their own stats/abilities/actions." },
  endless_bloom: { name: "Endless Bloom", category: "regalia", description: "At the start of every combat, gain Regeneration equal to 5% of your maximum Health per round for 5 rounds." },

  // ---- Regalia of the First Bloom set bonuses (Aelthyr) ----
  blessing_of_renewal: { name: "Blessing of Renewal", category: "set", description: "Regalia of the First Bloom (2pc). Restore 3% of maximum Health at the start of every round." },
  overflowing_life: { name: "Overflowing Life", category: "set", description: "Regalia of the First Bloom (4pc). Whenever you're healed beyond full Health, the excess becomes Temporary Health (capped at 30% of maximum Health)." },
  avatar_of_bloom: { name: "Avatar of Bloom", category: "set", description: "Regalia of the First Bloom (6pc). Once per combat, the first time you drop below 25% Health: instantly restore 50% max Health, cleanse negative status effects (currently a no-op — see Nature's Persistence), and gain +25% Attack/Magic/Defense for 3 rounds." },
};

function getEffectDef(effectId) {
  return EFFECT_DEFS[effectId] || null;
}

// Whether any currently-equipped item carries the given effect id. Boolean
// presence only — see file header on why this never "stacks" by count.
function hasEffect(state, effectId) {
  for (const slot of EQUIP_SLOTS) {
    const items = slot === "trinkets" ? state.equipment.trinkets : (state.equipment[slot] ? [state.equipment[slot]] : []);
    for (const item of items) {
      const def = ITEM_DEFS[item];
      if (def && def.effects && def.effects.includes(effectId)) return true;
    }
  }
  return false;
}
