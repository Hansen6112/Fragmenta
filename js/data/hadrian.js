/*
 * FRAGMENTA — Hadrian Voric, the Grand Ovum's Champion
 * Companion Character Sheet v1.3 (owner-approved design record). This
 * file carries identity/lore/appearance/personality, his starting stat
 * block and equipment, and his full ability-kit DATA (actives/passives) —
 * the engine that actually RUNS that kit lives in engine/companion.js.
 *
 * Deliberately NOT implemented here (per the source record's own scoping,
 * and the owner's explicit call on this pass): the Personal Quest
 * ("History's Sting"), the dedicated Hadrian relationship/affinity meter
 * it needs, the two NPCs it requires (Astra Sa'Lahru, the Bruised Mage),
 * the Legendary equipment ascension ("The Bloodbound Champion's
 * Regalia") and the two quest-reward Trinkets — all of that is quest-
 * gated and out of scope until that quest is separately built. His two
 * Trinket slots stay empty for now. The Section 9 dialogue/bark catalog
 * (greetings, travel lines, per-ability barks, victory/defeat variants,
 * death/revival voice) is also deferred — only the handful of lines the
 * recruitment moment itself needs (his loss/decline/recruit lines) are
 * included below.
 *
 * Numbers not given explicitly in the source record (his per-level growth
 * rates; the "ally danger threshold" his proactive taunting reacts to;
 * mapping his Poison/Toxic/Decay vulnerability onto this engine's actual
 * damage-type vocabulary, which has no such types today) are this
 * implementation's own reasonable interpretation, flagged here rather
 * than silently invented as if the source specified them.
 */

const HADRIAN = {
  id: "hadrian",
  name: "Hadrian Voric",
  title: "The Champion",
  tagline: "the Grand Ovum's reigning Champion, undefeated in eleven years of bouts",
  nation: "sanguivorum",
  age: 38,
  description:
    "Tall and olive-toned, deeply tanned from years spent under Sahrimor's sun, with dark hair going grey and a face notably unscarred — young fighters often doubt he's the real Champion until he proves them wrong. Studded leather underarmor in the Red Creed's colors, polished plate over the arms and shoulders stamped with Kar'Mhal's horned-helm-and-burning-sword, and a two-handed maul wielded with the crushing, unhurried confidence of someone who has never needed to hurry. A sash — once white silk, now soaked entirely crimson by years of victories, never washed — is clipped at his left shoulder and drapes to the hip.",
  narrative:
    "An unknown pit fighter once, before the Sanguivorum-Sahrimor war put him in the Legion as Ferratum heavy infantry. He rose to Vigilis and retired after single-handedly defeating the Akharu general Astra Sa'Lahru, taking a near-fatal wound to the chest that left him permanently vulnerable to poison, toxins, and decay. It was in the Legion he found Kar'Mhal and the Red Creed; on retiring he went back to pit fighting rather than settle down, and over years became the Grand Ovum's Champion — delivering a short, fervent sermon after every victory, sincere enough that he's regarded as a leading voice of the faith despite never being formally ordained. Privately, he doubts he's ever truly been tested, and worries that doubt makes him an unfaithful believer by his own faith's standard.",
  // AI Notes (Section 8.6/8.2): drives resolveHadrianAction's stance
  // dispatch in engine/companion.js.
  values: "Honorable combat, faith, earned respect, redemption through action, promises kept.",
  likes: "Weapons, battle, honorable decisions, promises being kept.",
  dislikes: "Trickery, broken promises, a player actively committing crimes.",

  // ---- Recruitment flavor (Section 6) ----
  recruitment: {
    // Shown once, the first time the player reaches Crimson rank at the
    // Grand Ovum (engine/arena.js's maybeArenaRankUp) — "Hadrian's
    // introduction event triggers and he offers a sanctioned one-on-one
    // duel." Crimson's repThreshold (84) already exceeds the source
    // record's stated 75-Reputation gate, so reaching Crimson rank alone
    // satisfies it — no separate reputation check needed.
    // His name is not yet known to the player at this point — that's the
    // reveal at the end of the duel (Section 6's recruitment chain, step
    // 8) — so this stays 'fight champion', not his name.
    summons:
      `A woman in a blood-red overseer's coat catches your eye across the sand before you can even ask. "Crimson," she says, like it settles something. "He's been waiting for someone to actually earn this." She nods toward the champion's gate. "Say 'fight champion' when you're ready. He won't be."`,
    // Shown if the player loses the sanctioned duel — health is restored
    // (non-lethal, same as every arena fight but Death Match), streak
    // resets, and the challenge stays permanently available.
    loss:
      `"You have fought well. Kar'Mhal sees you, young one. Return when your blood boils again."`,
    // Shown immediately after winning, before the accept/decline choice.
    offer:
      `"The Grand Ovum has shown me every challenge it can offer. If I remain, I will only repeat yesterday's victories. Walk the world with me, and together we will seek battles worthy of remembrance."`,
    // 'recruit hadrian' after winning.
    accept:
      `"Very well. You have my shield." Hadrian relinquishes the title of Champion without a backward glance at the gate.`,
    // 'decline hadrian' after winning — permanent miss; he leaves the
    // Grand Ovum and cannot be recruited there again (the alternate
    // Sahrimor path, if not already resolved, remains open).
    decline:
      `"I see. In that case, I will travel to Sahrimor to find a challenger worthy of my maul. Go forth and conquer greater challenges." He turns and walks toward the gate, and doesn't look back.`,
    // Alternate path (Thalvora ambush, Sahrimor) — offered once more if
    // the player saves him there after the Grand Ovum path was declined
    // or never reached. A second refusal here is final by design.
    thalvoraOffer:
      `Bloodied but upright, Hadrian looks between you and the five bodies in the sand. "Twice fortune has put you in my path. I'd be a fool to walk on from that a second time — if you'll have me."`,
    thalvoraDecline:
      `He studies you a moment, then nods once, like he expected as much. "Then I'll go deeper into Sahrimor. Somewhere in it, there's a fight worth what's left of my life." He doesn't ask again.`,
  },

  // ---- 7.4 Starting Stat Block (Level 1) ----
  // These feed directly into ALLY_DEFS.hadrian's atkMod/defMod/etc as
  // flat mods (target stat minus this engine's BASE_* constant) — see
  // data/allies.js. Initiative (the sheet's term) maps onto this engine's
  // Speed stat, which already governs turn order.
  startingStats: { health: 40, atk: 18, def: 16, magic: 12, knowledge: 14, speed: 8, accuracy: 14, agility: 8 },

  // ---- 7.5 Growth Profile ----
  // "High offense and survivability... Speed and Agility growth
  // deliberately kept low... small supplemental Magic increase each
  // level." The source gives that qualitative shape, not exact numbers —
  // these are this implementation's own values, set noticeably higher
  // than Kessa's on atk/def/health/knowledge, and lower on speed/agility.
  growth: { atk: 1.1, def: 0.9, health: 3.2, accuracy: 0.3, agility: 0.15, speed: 0.15, magic: 0.15, knowledge: 0.1 },

  // ---- 7.2 Class & Combat Role / 7.3 Default Stance ----
  role: "Juggernaut",
  defaultStance: "defensive",

  // ---- 7.6 Starting Equipment (Level 1) ----
  // Item names below are authored into data/items.js (source:
  // "companion" — excluded from every loot pool, bound to Hadrian only)
  // and equipped directly into his ally.equipment at recruitment, rather
  // than handed to the player to 'give' — he arrives already wearing
  // them. Their named passives (Crushing Impact, Stalwart, Brace, Armor
  // Crack, Surefooted, Executioner) have no "Mechanical Effect" spelled
  // out in the source record — only their Legendary-ascension upgrades
  // do (Section 11.4, quest-gated and deferred) — so they're flavor
  // labels on real stat-bonus gear for now, not new wired mechanics.
  startingEquipment: {
    mainhand: "Bloodbound Champion's Maul",
    helmet: "Bloodbound Champion Helm",
    chest: "Bloodbound Champion Cuirass",
    gloves: "Bloodbound Champion Gauntlets",
    boots: "Bloodbound Champion Boots",
    cloak: "Crimson Champion's Sash",
  },

  // ---- 8.5 Damage Affinity ----
  // The permanent Ankahru-wound vulnerability. "Poison/Toxic/Decay" have
  // no existing damage-type vocabulary in this engine (the closest is the
  // `venom` status effect) — mapped here onto `venom` DOT ticks
  // specifically, rather than inventing a whole parallel damage-type
  // system for one companion's flavor vulnerability.
  vulnerability: { statuses: ["venom"], multiplier: 1.25 },

  // ---- 8.3/8.4 Ability Kit ----
  // Consumed by engine/companion.js's resolveHadrianAction. `level` gates
  // unlock (checked against ally.level, which syncs to the player's
  // level on recruitment and on every level-up thereafter, same as any
  // other ally).
  actives: [
    {
      id: "crushing_blow", name: "Crushing Blow", level: 1, cooldown: 3,
      atkMult: 1.6, defIgnorePct: 0.2,
      // Consumes Empowered Strike (Unyielding Advance) if active.
      consumesEmpoweredStrike: true,
    },
    {
      id: "shielding_presence", name: "Shielding Presence", level: 1, cooldown: 4,
      tauntTurns: 2, dmgReductionPct: 0.2, dmgReductionTurns: 2,
    },
    {
      id: "groundbreaker", name: "Groundbreaker", level: 5, cooldown: 4,
      atkMult: 1.5, splashAtkMult: 0.6, splashAll: true,
      accuracyDebuff: 10, accuracyDebuffTurns: 2,
      consumesEmpoweredStrike: true,
    },
    {
      id: "unyielding_advance", name: "Unyielding Advance", level: 10, cooldown: 5,
      cleanse: true, healPct: 0.15, empoweredStrikePct: 0.3, empoweredStrikeTurns: 2,
    },
    {
      id: "champions_challenge", name: "Champion's Challenge", level: 15, cooldown: 5,
      tauntTurns: 1, bonusDef: 3, bonusDefTurns: 2,
    },
    {
      id: "last_bastion", name: "Last Bastion", level: 20, cooldown: 8,
      tauntTurns: 3, dmgReductionPct: 0.35, dmgReductionTurns: 3,
      retaliatePct: 0.8, retaliateTurns: 3,
    },
    {
      id: "arena_incarnate", name: "Arena Incarnate", level: 25, cooldown: 10,
      ultimateTurns: 3, ultimateAtkPct: 0.25, ultimateDefPct: 0.25,
      cdrOnHit: 1, halvesVulnerabilityDamage: true,
    },
  ],
  passives: [
    {
      id: "champions_resolve", name: "Champion's Resolve", level: 1,
      trigger: "healthFloor", floorPct: 0.25, cleanseOne: true, oncePerCombat: true,
    },
    {
      id: "unbroken_will", name: "Unbroken Will", level: 8,
      trigger: "healthBelowPct", threshold: 0.5, dmgReductionPct: 0.15, atkBonusPct: 0.1,
    },
    {
      id: "veteran_of_a_hundred_battles", name: "Veteran of a Hundred Battles", level: 16,
      trigger: "healthLostScaling", pctPer10: 0.02, capPct: 0.2,
    },
    {
      id: "bloodbound_paragon", name: "Bloodbound Paragon", level: 25,
      trigger: "onKill", cleanseSelfAndLowestAlly: true, allyDmgReductionPct: 0.1, allyBuffTurns: 2,
    },
  ],
};
