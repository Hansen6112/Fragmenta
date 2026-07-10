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
