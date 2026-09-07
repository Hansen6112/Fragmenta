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
  merchants_eye: { name: "Merchant's Eye", category: "utility", description: "Shop purchase prices -5%, sale prices +5%." },

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
  // game (an Elite/Boss creature classification for Kingslayer now works
  // off the real Danger Class/Spawn Rarity tags via isNotableCreature —
  // see data/creaturetags.js/engine/combat.js — and IS live; Unbreakable
  // and Iron Will need a player-facing Defense-reduction/stun mechanic
  // that doesn't exist anywhere yet, and Overwhelming Force is explicitly
  // designed for multi-enemy fights, which this engine doesn't have yet
  // (multi-enemy combat and allies are planned) — all three are
  // registered and inert until those systems exist,
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

  // ---- Divine Regalia (Mortasha) ----
  gentle_crossing: { name: "Gentle Crossing", category: "regalia", description: "Whenever an enemy dies, restore 5% of your maximum Mana and reduce one random cooldown by 1 turn. Currently inert — this engine has no Mana resource (only a static Magic stat, nothing depletable to restore a percentage of), and since every encounter here is a single enemy, a kill always ends the fight before a mid-fight cooldown reduction could ever matter." },
  between_worlds: { name: "Between Worlds", category: "regalia", description: "The first fatal hit each combat leaves you at 1 Health instead. Does not heal you. Mechanically the same 1-HP reprieve as Last Stand, deliberately without its +5 Attack." },
  rest_eternal: { name: "Rest Eternal", category: "regalia", description: "Enemies you kill cannot benefit from revival, resurrection, regeneration, or death-triggered effects. Currently inert — no creature in this engine has any such mechanic yet; future-proofing for when bosses gain one." },
  passing_whisper: { name: "Passing Whisper", category: "regalia", description: "Every defeated enemy grants +1 Magic until combat ends, capped at +15. Persists across fights and decays on rest, the same approximation Vanguard Momentum uses for its own 'until combat ends' wording." },
  calm_beyond_fear: { name: "Calm Beyond Fear", category: "regalia", description: "Fear, Terror, Panic, and similar morale effects cannot affect you. Currently inert — nothing in this engine applies morale/fear effects to the player; enemies have no abilities or actions of their own yet." },
  soul_ledger: { name: "Soul Ledger", category: "regalia", description: "Every enemy you defeat permanently records one Soul (whole-game, uncapped). At every 100th Soul, choose one permanent gift: +1 Health, +1 Magic, or +1 Defense." },

  // ---- Regalia of the Final Veil set bonuses (Mortasha) ----
  blessing_of_acceptance: { name: "Blessing of Acceptance", category: "set", description: "Regalia of the Final Veil (2pc). Negative status durations on you are reduced by 1 round. Currently inert — nothing in this engine ever applies a negative status effect to the player to shorten." },
  mercy_of_the_veil: { name: "Mercy of the Veil", category: "set", description: "Regalia of the Final Veil (4pc). The first time each combat you fall below 40% Health, immediately remove every negative status effect. Currently inert — same reason as Blessing of Acceptance; there's nothing to remove." },
  avatar_of_passing: { name: "Avatar of Passing", category: "set", description: "Regalia of the Final Veil (6pc). Once per combat, the first time you drop below 25% Health: for 4 rounds, all damage you deal heals you for 30%. The set's other stated clauses (ignoring enemy resurrection, an AoE soul-explosion on kill, Fear/Death-magic immunity) are no-ops for now — no enemy resurrection mechanic, no multi-target combat, and no Fear/Death magic exist yet." },

  // ---- Divine Regalia (Veylana) ----
  foreseen_strike: { name: "Foreseen Strike", category: "regalia", description: "Every 3rd attack or spell ignores 50% of the target's effective Defense. Its 'cannot miss' clause is trivially already true — the player's own attacks in this engine always deal at least 1 damage, with no miss/failure state to bypass." },
  redirected_fate: { name: "Redirected Fate", category: "regalia", description: "Once per combat, converts a critical hit you'd suffer into a normal hit. Currently inert — this engine has no concept of enemies landing a critical hit against the player; enemy attacks are a flat roll with no crit mechanic of their own yet." },
  threads_intertwined: { name: "Threads Intertwined", category: "regalia", description: "Whenever one of your passive abilities activates, 25% chance another equipped passive immediately activates too (if eligible). Currently inert — every effect in this engine is a bespoke check hand-wired at its own specific call site; there's no generic 'a passive just activated' event to hook a cross-passive trigger into without re-architecting the whole effects system." },
  every_choice_matters: { name: "Every Choice Matters", category: "regalia", description: "Whenever you dodge, block, or negate damage, gain +2 Attack and +2 Magic until combat ends, capped at +10/+10 (5 triggers)." },
  guided_footsteps: { name: "Guided Footsteps", category: "regalia", description: "The first enemy attack each combat has a 75% chance to miss." },
  weavers_insight: { name: "Weaver's Insight", category: "regalia", description: "Reveals the enemy's Health, Defense, Attack, and active status at the start of combat. Its 'future bosses reveal hidden phases one turn earlier' clause is explicitly forward-looking — nothing to build for that yet." },

  // ---- Regalia of the Woven Thread set bonuses (Veylana) ----
  blessing_of_guidance: { name: "Blessing of Guidance", category: "set", description: "Regalia of the Woven Thread (2pc). The first attack or spell each combat gains +25% Critical Chance — the only source of critical-hit chance this engine has; see critMultiplier in engine/combat.js." },
  threads_of_consequence: { name: "Threads of Consequence", category: "set", description: "Regalia of the Woven Thread (4pc). Whenever an enemy misses you, your next attack deals 40% additional damage." },
  avatar_of_fate: { name: "Avatar of Fate", category: "set", description: "Regalia of the Woven Thread (6pc). Once per combat, the first time you drop below 25% Health: for 4 rounds, critical hits deal double their bonus damage, and once during the window you may survive a fatal blow at 1 Health. Its 'every attack cannot miss' and 'enemy dodge/block/evasion ignored' clauses are trivially already true — no miss state exists on the player's attacks, and nothing in this engine lets an enemy dodge/block one in the first place." },

  // ---- Divine Regalia (Kar'Mhal) ----
  worthy_challenge: { name: "Worthy Challenge", category: "regalia", description: "Every attack against the enemy with the highest current Health grants +5% permanent damage for the rest of combat, capped at +50%. 'Highest current Health' is trivially always THE enemy in this engine's single-target combat, so this fires on every attack unconditionally." },
  unbroken_line: { name: "Unbroken Line", category: "regalia", description: "After taking damage 3 times, gain 25% Damage Reduction for the next 2 rounds, then the counter resets." },
  battle_tempered: { name: "Battle Tempered", category: "regalia", description: "Every round spent in combat grants +1 Attack and +1 Defense, capped at +10/+10." },
  victors_momentum: { name: "Victor's Momentum", category: "regalia", description: "Every defeated enemy grants +3 Attack for the remainder of combat, uncapped. Since a kill always ends this engine's single-enemy fight, this persists across fights and decays on rest instead — the same approximation Vanguard Momentum/Passing Whisper use for the same wording." },
  clash_of_steel: { name: "Clash of Steel", category: "regalia", description: "Counterattacks (Riposte — the only counterattack mechanic the player has) deal 50% additional damage." },
  rally_the_line: { name: "Rally the Line", category: "regalia", description: "The first time your Health drops below 50% each combat, gain +10 Attack and +10 Defense for 4 rounds." },

  // ---- Regalia of the Crimson Vanguard set bonuses (Kar'Mhal) ----
  blessing_of_valor: { name: "Blessing of Valor", category: "set", description: "Regalia of the Crimson Vanguard (2pc). Your opening attack each combat deals +30% damage. If it defeats the target, immediately restore 15% max Health." },
  commanding_presence: { name: "Commanding Presence", category: "set", description: "Regalia of the Crimson Vanguard (4pc). Every 3rd attack fully ignores the target's Defense. Its 'cannot miss'/'cannot be blocked' clauses are trivially already true — no miss state exists on the player's attacks, and nothing in this engine lets an enemy block one in the first place." },
  avatar_of_war: { name: "Avatar of War", category: "set", description: "Regalia of the Crimson Vanguard (6pc). Once per combat, the first time you drop below 25% Health: for 4 rounds, gain +50% Attack, every successful attack restores 10% Health, and Riposte (if equipped) fires after every enemy hit rather than only a zero-damage one. Its 'immune to Fear/Stun/Disarm' clause is trivially already true (none of those exist as player-targeting mechanics here), and 'defeating an enemy grants another attack' is inert for the same reason Second Wind (Mythic) is — a kill always ends this engine's single-enemy fight." },

  // ---- Divine Regalia (Ithrien) ----
  endless_study: { name: "Endless Study", category: "regalia", description: "The first time you use each distinct Ability or Tactic in a fight, permanently gain +2 Magic for that combat, capped at +20." },
  prepared_response: { name: "Prepared Response", category: "regalia", description: "Whenever an enemy uses an ability you've already witnessed this combat, reduce its damage against you by 25%. Enemies here only ever have one retaliation 'ability,' so this is trivially true from the 2nd enemy hit onward." },
  expanding_mind: { name: "Expanding Mind", category: "regalia", description: "Every 5 Knowledge above 50 grants +1 Magic during combat — a live formula off the current Knowledge stat." },
  eureka: { name: "Eureka", category: "regalia", description: "Every 4th elemental cast has no cooldown after resolving." },
  precision_formula: { name: "Precision Formula", category: "regalia", description: "Magic attacks ignore 30% of the target's effective Defense — this engine has no separate Magic Resistance stat." },
  archive_eternal: { name: "Archive Eternal", category: "regalia", description: "Whenever combat ends, permanently record the defeated creature's species. The first time each species is recorded, gain +1 permanent Knowledge, uncapped. Bestiary creatures use their stable bestiary key; dynamically-generated enemy mages (whose name/id is randomized per instance) are bucketed by element instead, so this can't be farmed infinitely." },

  // ---- Regalia of the Endless Archive set bonuses (Ithrien) ----
  blessing_of_insight: { name: "Blessing of Insight", category: "set", description: "Regalia of the Endless Archive (2pc). Critical spell chance increased by 20% (stacks additively with any other crit-chance source). Enemy elemental weaknesses are revealed at the start of combat." },
  universal_understanding: { name: "Universal Understanding", category: "set", description: "Regalia of the Endless Archive (4pc). Whenever you cast an elemental spell, randomly reduce the cooldown of another known, currently-cooling-down element by 2." },
  avatar_of_knowledge: { name: "Avatar of Knowledge", category: "set", description: "Regalia of the Endless Archive (6pc). Once per combat, the first time you drop below 25% Health: for 4 rounds, all spells cost no cooldown, +50% Magic, +25 Knowledge (feeds Expanding Mind's formula specifically, rather than being threaded through every ability-unlock gate in the codebase), elemental matchup penalties are ignored and advantages flatten to 1.5x, and hidden enemy statistics are revealed (folded into this same activation message rather than repeated on every attack)." },

  // ---- Regalia of the Eternal Heart passives (Seressa) ----
  compassions_grace: { name: "Compassion's Grace", category: "regalia", description: "Whenever you heal, gain +2 Defense, capped at +10 (5 stacks). Simplified to persist for the remainder of combat rather than decaying after 2 rounds per stack — the same 'permanent for the fight, capped' approximation already used for Living Steel, Every Choice Matters, and Battle Tempered, since nothing in this engine tracks independent per-stack durations." },
  shared_burden: { name: "Shared Burden", category: "regalia", description: "The first time each combat you would take damage exceeding 30% of your max Health, reduce that hit by 40%." },
  unwavering_devotion: { name: "Unwavering Devotion", category: "regalia", description: "Every round spent in combat grants +2 Magic, capped at +20 (10 rounds)." },
  faithful_heart: { name: "Faithful Heart", category: "regalia", description: "All beneficial effects you grant yourself last 1 additional round." },
  calming_presence: { name: "Calming Presence", category: "regalia", description: "During the first 3 rounds of combat, incoming damage is reduced by 10%." },
  love_endures: { name: "Love Endures", category: "regalia", description: "Once per combat, if you would drop below 20% Health, immediately heal for 15% max Health." },

  // ---- Regalia of the Eternal Heart set bonuses (Seressa) ----
  blessing_of_compassion: { name: "Blessing of Compassion", category: "set", description: "Regalia of the Eternal Heart (2pc). All healing you receive is increased by 25%." },
  heartward_bond: { name: "Heartward Bond", category: "set", description: "Regalia of the Eternal Heart (4pc). Whenever you grant yourself a beneficial effect, also gain +2 Attack, +2 Magic, and +2 Defense for its duration — piggybacking on the same applyBeneficialEffectBonuses() hook Faithful Heart uses, since both modify the same universe of buff-duration call sites." },
  avatar_of_devotion: { name: "Avatar of Devotion", category: "set", description: "Regalia of the Eternal Heart (6pc). Once per combat, the first time you drop below 25% Health: for 4 rounds, healing you receive is doubled and damage you take is reduced by 35%, and once during the window (immediately following any cheat-death save that fires, from any source) you additionally heal for 20% max Health. Any heal received while active also bursts +5 Attack/+5 Magic/+5 Defense for 2 rounds." },

  // ---- Regalia of the Laughing Gale passives (Nystros) ----
  loaded_dice: { name: "Loaded Dice", category: "regalia", description: "Every attack or spell has a 20% chance to deal either 50% less or 100% more damage, equally likely. The favorable (double-damage) roll also counts as a favorable random effect for Twist of Fate." },
  fortunes_favor: { name: "Fortune's Favor", category: "regalia", description: "Whenever you would receive a negative status effect, there is a 35% chance it instead fails completely. Currently inert — nothing in this engine ever applies a negative status effect to the player (see Immutable/Nature's Persistence for the same limitation), so there's nothing for this to ever intercept." },
  winds_of_change: { name: "Winds of Change", category: "regalia", description: "At the start of each round, randomly gain +6 Attack, +6 Defense, +6 Magic, or +6 Knowledge, replaced by a freshly rolled stat the following round. Always favors the player, so it also counts as a favorable random effect for Twist of Fate every round it's equipped." },
  unlikely_outcome: { name: "Unlikely Outcome", category: "regalia", description: "Whenever an attack against you fails to land — the same 'retaliation dealt zero damage' signal Every Choice Matters/Threads of Consequence key off — your next attack is a guaranteed critical hit." },
  never_where_expected: { name: "Never Where Expected", category: "regalia", description: "Every enemy attack has a flat 15% chance to miss, regardless of accuracy." },
  double_or_nothing: { name: "Double or Nothing", category: "regalia", description: "Once per combat, using an Ability or Tactic lets you gamble: 50% chance its effect is doubled, 50% chance the action fails entirely. Currently inert — this engine has no generic 'the effect of whatever ability just resolved' interface to double or cancel after the fact (abilities range from flat damage to buffs to cooldown-gated tactics, each with its own bespoke resolution), and no interactive per-action opt-in prompt a player could choose to invoke or decline mid-action. Building this generically would mean either a bespoke doubler/canceler for every existing ability and tactic, or an entirely new choice-flow layer — the same class of limitation as Threads Intertwined." },

  // ---- Regalia of the Laughing Gale set bonuses (Nystros) ----
  blessing_of_fortune: { name: "Blessing of Fortune", category: "set", description: "Regalia of the Laughing Gale (2pc). Every successful critical hit grants +5% Critical Chance, capped at +25% (5 stacks)." },
  twist_of_fate: { name: "Twist of Fate", category: "set", description: "Regalia of the Laughing Gale (4pc). Whenever one of this set's own random passives favors you (Loaded Dice's double-damage roll, Winds of Change's per-round reroll, or a miss triggering Unlikely Outcome), immediately restore 5% max Health and reduce a random currently-cooling-down ability by 1 turn. Deliberately scoped to this set's own randomness rather than the pre-existing generic crit/dodge systems from other gods' sets, which would fire constantly and swamp the intended 'chaos favors you' flavor with unrelated procs." },
  avatar_of_chaos: { name: "Avatar of Chaos", category: "set", description: "Regalia of the Laughing Gale (6pc). Once per combat, the first time you drop below 25% Health: for 4 rounds, every hit's damage is randomized between 75% and 175%, critical chance is doubled, and every critical hit grants a random +10 Attack/Defense/Magic/Knowledge bonus that persists for the rest of the window (capped at +30 per stat, rather than tracking each proc's own independent 2-round timer — the same 'permanent for the bounded window, capped' simplification already used for Compassion's Grace/Battle Tempered/Living Steel). Its 'negative status effects have a 50% chance to fail' clause is inert for the same reason as Fortune's Favor above." },

  // ---- Regalia of the Eternal Bastion passives (Xalaxar) ----
  stones_patience: { name: "Stone's Patience", category: "regalia", description: "Whenever you do not move first in a combat round, your next attack deals 30% additional damage. Turn order is decided by Speed — whenever a faster enemy acts before you, your next hit carries this bonus." },
  unyielding_wall: { name: "Unyielding Wall", category: "regalia", description: "The first hit that would deal more than 25% of your maximum Health instead deals exactly 25%, usable again every 3 rounds." },
  bedrock: { name: "Bedrock", category: "regalia", description: "Defense reductions cannot lower your Defense below 75% of its base value. Currently inert — nothing in this engine ever reduces the player's own Defense stat (Corrode/Armor Crack/Disarm all only ever reduce the ENEMY's numbers), so there's no reduction for this to ever floor." },
  ordered_mind: { name: "Ordered Mind", category: "regalia", description: "Whenever you resist or ignore a negative effect, gain +2 Defense, capped at +12. Currently inert — the same reason as Fortune's Favor: no negative status effect mechanic exists on the player side to ever resist or ignore." },
  grounded: { name: "Grounded", category: "regalia", description: "Forced movement, knockback, and displacement effects automatically fail against you. Currently inert — the item's own description calls this 'future-proofed for later mechanics,' and indeed none of those mechanics exist yet." },
  lasting_foundation: { name: "Lasting Foundation", category: "regalia", description: "At the end of every third combat round, restore 10% of your maximum Health." },

  // ---- Regalia of the Eternal Bastion set bonuses (Xalaxar) ----
  blessing_of_stone: { name: "Blessing of Stone", category: "set", description: "Regalia of the Eternal Bastion (2pc). 15% Damage Reduction whenever current Health is above 50% max." },
  walls_endure: { name: "Walls Endure", category: "set", description: "Regalia of the Eternal Bastion (4pc). Each time you take damage, gain +1 Defense, capped at +20. Resets after combat." },
  avatar_of_endurance: { name: "Avatar of Endurance", category: "set", description: "Regalia of the Eternal Bastion (6pc). Once per combat, the first time you drop below 25% Health: for 4 rounds, damage taken is reduced by 50% and healing received is increased by 50%, and every hit taken grants +2 Attack/+2 Defense, capped at +20/+20 for the window. Its 'immune to Defense reduction' and 'immune to forced movement/knockback/displacement' clauses are trivially already true — the same reason as Bedrock/Grounded above." },

  // ---- Regalia of the Endless Horizon passives (Aethyra) ----
  momentum_unbound: { name: "Momentum Unbound", category: "regalia", description: "Whenever you use a different action type than your previous turn (Attack, Tactic, or Elemental Ability), gain +5% damage, capped at +30% (6 stacks). The source text says each stack lasts 2 rounds, but this engine has no precedent for independent per-stack expiry (every stacking bonus here is permanent for the rest of the fight once gained), so it's approximated the same way for consistency." },
  open_road: { name: "Open Road", category: "regalia", description: "Whenever you successfully evade an enemy attack, reduce all active cooldowns by 1 turn." },
  unbound_spirit: { name: "Unbound Spirit", category: "regalia", description: "Immune to Stun, Root, Silence, and Ability Lock — any effect that prevents you from taking your chosen action fails. Currently inert — the same standing reason as every CC-immunity effect so far: no enemy-applied control mechanic exists yet on the player side; deferred to the promised future enemy rework." },
  wanderers_reward: { name: "Wanderer's Reward", category: "regalia", description: "Whenever you use an ability that hasn't been used during either of the previous two turns, gain +4 Attack/+4 Magic for 2 rounds. 'An ability' is read broadly to include the plain Attack as well as Tactics and Elemental Abilities, the same generic per-action key Endless Study already treats uniformly." },
  swift_passage: { name: "Swift Passage", category: "regalia", description: "After defeating an enemy, your next Ability or Tactic has no cooldown, once per combat. Since a kill always ends this engine's single-enemy fight, that 'next' use only ever happens in the player's NEXT fight — the same 'queue a charge for the next fight' pattern Forest Guardian (Vaeloris 6pc) already established." },
  trailblazer: { name: "Trailblazer", category: "regalia", description: "Your first Ability or Tactic each combat ignores all activation restrictions except cooldowns (Ambush's opening-move-only gate, Disarm's already-disarmed gate, an element's known-element/corroded gates, and Knowledge requirements)." },

  // ---- Regalia of the Endless Horizon set bonuses (Aethyra) ----
  blessing_of_freedom: { name: "Blessing of Freedom", category: "set", description: "Regalia of the Endless Horizon (2pc). Gain a flat 15% Evasion chance against every enemy attack. Whenever you evade an attack (from any source), restore 5% max Health." },
  ever_forward: { name: "Ever Forward", category: "set", description: "Regalia of the Endless Horizon (4pc). Whenever you use three different action types consecutively (Attack, Tactic, Elemental Ability, in any order), gain +10 Attack/+10 Magic for 3 rounds." },
  avatar_of_freedom: { name: "Avatar of Freedom", category: "set", description: "Regalia of the Endless Horizon (6pc). Once per combat, the first time you drop below 25% Health: for 4 rounds, gain an additional 50% Evasion chance (stacking with Blessing of Freedom's own 15%), cooldowns recover twice as fast, and every Ability/Tactic's activation restrictions (except cooldowns) can be ignored. Its 'immune to all control effects' clause is inert for the same reason as Unbound Spirit above. Its 'first failed attack each round is automatically rerolled' clause is also a no-op — the player's own attacks in this engine always deal at least 1 damage, with no miss/failure state on the player's side for a reroll to ever act on." },

  // ---- Regalia of the Eternal Forge passives (Pyreith) ----
  tempered_steel: { name: "Tempered Steel", category: "regalia", description: "Each successful attack (physical or spell) permanently gains +2% damage for the remainder of combat, capped at +30% (15 stacks)." },
  reinforced: { name: "Reinforced", category: "regalia", description: "Every 3rd enemy attack against you (counted whether or not it actually lands) permanently grants +2 Defense for the combat, capped at +20 (10 triggers)." },
  crafted_perfection: { name: "Crafted Perfection", category: "regalia", description: "The first time each equipped passive activates during combat, its effect is increased by 50%. Currently inert — the same reason as Threads Intertwined (Regalia of the Woven Thread): every effect in this engine is a bespoke check hand-wired at its own specific call site, with no generic 'a passive just activated' event to hook a blanket first-activation amplifier into without re-architecting the whole effects system." },
  work_refines: { name: "Work Refines", category: "regalia", description: "Every 3rd action permanently grants +2 Attack/+2 Magic for the remainder of combat, capped at +20/+20 (10 triggers)." },
  master_craftsman: { name: "Master Craftsman", category: "regalia", description: "Whenever your effective Attack exceeds an enemy's Defense by 10 or more on a physical hit, deal an additional 20% damage." },
  living_forge: { name: "Living Forge", category: "regalia", description: "Every cooldown that completes restores 3% Health and 3% Mana. The Mana half is a no-op — this engine has no Mana resource (the same standing limitation cited for every other Mana-flavored clause so far)." },

  // ---- Regalia of the Eternal Forge set bonuses (Pyreith) ----
  blessing_of_creation: { name: "Blessing of Creation", category: "set", description: "Regalia of the Eternal Forge (2pc). Whenever you gain a temporary (duration-based) stat bonus, increase its magnitude by 25% — scoped to the atk/magic/defBuffAmount-style buffs (Hold the Line, Rooted Resolve, Rally the Line, the various 'Avatar of X' bursts, Wanderer's Reward, Ever Forward), not the separate permanent-for-the-fight stacking counters (Battle Tempered, Tempered Steel, Reinforced, Work Refines, etc.), which the source text's own 'temporary' wording doesn't cover." },
  perfected_craft: { name: "Perfected Craft", category: "set", description: "Regalia of the Eternal Forge (4pc). Every equipped passive may activate one additional time per combat if its conditions are met. Currently inert — doubling every 'once per combat' gate in this engine (Guardian Spirit, Rooted Resolve, Rally the Line, Blessing of Valor, Shared Burden, Love Endures, every 'Avatar of X' trigger, every cheat-death save, etc.) would mean converting dozens of independent boolean 'Used' flags into counters across the whole file — the same re-architecture-scale limitation as Crafted Perfection/Threads Intertwined above, just applied to activation COUNT instead of activation MAGNITUDE." },
  avatar_of_creation: { name: "Avatar of Creation", category: "set", description: "Regalia of the Eternal Forge (6pc). Once per combat, the first time you drop below 25% Health: for 4 rounds, +40% Attack/+40% Magic (temporary, boosted by Blessing of Creation) and cooldowns recover twice as fast, while every successful attack permanently increases Attack by +2 and every spell cast permanently increases Magic by +2 (these two deliberately outlive the 4-round window itself, per the source text's own 'permanently'). Its 'all passive abilities activate at 150% effectiveness' clause is inert for the same reason as Crafted Perfection/Perfected Craft above." },

  // ---- Regalia of the Endless Tide passives (Aqualis) ----
  flowing_waters: { name: "Flowing Waters", category: "regalia", description: "Restore 3% max Health at the end of every round. Its '3% Mana' half is a no-op — this engine has no Mana resource, the same standing limitation cited for every other Mana-flavored clause so far." },
  cleansing_current: { name: "Cleansing Current", category: "regalia", description: "Whenever you are healed, remove one random negative status effect. Currently inert — nothing in this engine ever applies a negative status effect to the player, so there's nothing for this to ever remove." },
  adaptive_tide: { name: "Adaptive Tide", category: "regalia", description: "Each time you receive damage from a particular source, reduce subsequent damage of that type by 5%, capped at 25% (5 stacks), tracked separately per type. Only physical and magic damage actually reach the player in this engine — 'Burn,' cited as an example in the source text, is a DoT the player only ever inflicts on enemies (Ignite), never receives, so that bucket never grows." },
  mercys_gift: { name: "Mercy's Gift", category: "regalia", description: "Whenever your Health falls below 50%, increase all healing received by 50% until you recover above half Health. A live check against current Health on every heal, not a triggered/latched buff." },
  patient_current: { name: "Patient Current", category: "regalia", description: "Every second round spent in combat, restore one random Ability or Tactic's cooldown by an additional turn." },
  calm_waters: { name: "Calm Waters", category: "regalia", description: "Whenever you remove a negative status effect, gain +4 Defense/+4 Magic for 2 rounds, stacking up to +12/+12. Currently inert — the same reason as Cleansing Current: nothing in this engine ever applies a negative status effect to the player, so this can never trigger." },

  // ---- Regalia of the Endless Tide set bonuses (Aqualis) ----
  blessing_of_the_tide: { name: "Blessing of the Tide", category: "set", description: "Regalia of the Endless Tide (2pc). Restore 10% max Health at the start of combat. Renamed from the source text's own 'Blessing of Renewal' — that exact name (and a different mechanic, a per-round heal) is already taken by Regalia of the First Bloom's own 2pc effect. Its '10% Mana' half is a no-op — no Mana resource exists." },
  endless_current: { name: "Endless Current", category: "set", description: "Regalia of the Endless Tide (4pc). Whenever you remove a negative effect (never happens — see Cleansing Current) or restore Health, gain +2 Attack/+2 Defense/+2 Magic for 3 rounds, stacking up to +10 in each (5 stacks)." },
  avatar_of_renewal: { name: "Avatar of Renewal", category: "set", description: "Regalia of the Endless Tide (6pc). Once per combat, the first time you drop below 25% Health: for 4 rounds, restore 10% max Health at the end of every round and reduce damage taken by 30%. Its 'automatically cleanse one negative effect each round' clause is inert for the same reason as Cleansing Current/Calm Waters above. Its 'healing cannot be reduced or prevented' clause is trivially already true — nothing in this engine has ever reduced or prevented the player's own healing. Its 'every healing effect also restores an equal amount of Mana' clause is a no-op — no Mana resource exists." },

  // ---- Regalia of the Eternal Hour passives (Chronaeus) ----
  borrowed_seconds: { name: "Borrowed Seconds", category: "regalia", description: "Every 4th action refunds 50% of the cooldown it just set. If that action has no cooldown at all (a plain Attack or Ambush), it instead grants that hit +15% damage." },
  timeless_guard: { name: "Timeless Guard", category: "regalia", description: "The first incoming attack every 3 rounds deals 0 damage entirely — a full negation, not just a damage cap, on its own 3-round recharge." },
  perfect_memory: { name: "Perfect Memory", category: "regalia", description: "The first time each distinct Tactic or Elemental Ability is used in a fight, permanently gain +2 Knowledge for that combat, capped at +16 (8 distinct actions). Never triggers on a plain Attack, unlike Endless Study's broader scope." },
  moment_preserved: { name: "Moment Preserved", category: "regalia", description: "The first buff you receive cannot expire naturally — it remains until combat ends. Currently inert — this engine represents buffs as 3 shared Attack/Defense/Magic duration fields (Math.max-composed across every buff source in the game, by design), not a list of independently-tracked buff instances, so there's no way to exempt only 'the first' buff from decay without also freezing every later buff that happens to share the same field — the same re-architecture-scale limitation as Crafted Perfection/Perfected Craft/Threads Intertwined." },
  unhurried_step: { name: "Unhurried Step", category: "regalia", description: "Enemy Haste, Speed, or Turn-order manipulation has no effect on you. Turn order is normally decided by Speed — this effect guarantees you still act first regardless of how much faster the enemy is." },
  hourglass_reserve: { name: "Hourglass Reserve", category: "regalia", description: "Once per combat, resets the cooldown of the first Ability or Tactic used back to 0 immediately after it's set. No interactive 'choose which ability' system exists, so this applies automatically to whichever Ability/Tactic is used first, the same approximation Trailblazer's own 'first use' effects already make." },

  // ---- Regalia of the Eternal Hour set bonuses (Chronaeus) ----
  blessing_of_the_hour: { name: "Blessing of the Hour", category: "set", description: "Regalia of the Eternal Hour (2pc). Cooldowns recover 1 additional turn every 4th round." },
  keeper_of_history: { name: "Keeper of History", category: "set", description: "Regalia of the Eternal Hour (4pc). Defeating an enemy restores 10% Health. Its '10% Mana' half is a no-op — no Mana resource exists. Its 'remove one cooldown from a random ability' half is effectively inert too — a kill always ends this engine's single-enemy fight, and the about-to-be-discarded combat object's cooldowns have no bearing on the next fight (unlike Swift Passage's explicitly-worded 'next Ability or Tactic' charge, which this clause doesn't share)." },
  avatar_of_time: { name: "Avatar of Time", category: "set", description: "Regalia of the Eternal Hour (6pc). Once per combat, the first time you drop below 25% Health: all cooldowns are zeroed immediately, and for 3 rounds (the only 'Avatar of X' whose own source text specifies a duration other than 4), every attack deals +25% damage, buff durations don't decay, and new Ability/Tactic cooldowns cost 0. Its 'debuff durations decrease twice as fast' clause is inert (no debuffs exist on the player side) and 'cannot be Stunned' is trivially already true (no player-stun mechanic exists at all). Its 'cooldowns resume from whatever they'd have naturally reached' clause is simplified to 'cooldowns simply remain at 0' — reconstructing a parallel shadow-cooldown ledger for this one edge case would be a bespoke tracking system disproportionate to the payoff, a documented simplification that slightly favors the player." },
};

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
