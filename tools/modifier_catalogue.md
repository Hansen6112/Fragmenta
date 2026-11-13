# Modifier Catalogue (Combat Rebuild Phase 2, step 2a)

Generated against `js/data/effects.js`, `js/data/sets.js`, `js/data/enemyabilities.js`, `js/engine/combat.js`, `js/engine/pipeline.js`, `js/engine/resolver.js`, `js/engine/companion.js`, `js/engine/parser.js`, `js/engine/state.js`, `js/data/actions.js` at commit `99ea225`. Draft for review per `tools/combat_rebuild_phase2_spec.md` §6 (step 2a) -- bucket/hook assignments here are a first pass, not final; rows marked `-- REVIEW` or **NONE FOUND** need a second look before 2b.

**Totals:** 175 gear-effect rows (EFFECT_DEFS combat/defense/magic/legendary/mythic/artifact/regalia categories + `tactical_memory`), 110 set-bonus tier rows (SETS `special`/`effects` tiers only -- flat stat tiers excluded, handled by `stat()`), 64 enemy-passive trigger-type rows (covering all 169 passive entries).

---

## 1. Gear Effects

| id | name | call site(s) | kind | works for today | proposed hook | proposed bucket | notes |
|---|---|---|---|---|---|---|---|
| `opening_reach` | Opening Reach | js/engine/combat.js:2316; js/engine/combat.js:2330 | outgoing-mult | player + plain ally; **not Hadrian kit path** (kind D) | calculateDamage.outgoing | conditional |  |
| `patient_aim` | Patient Aim | js/engine/pipeline.js:1805 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `armor_crack` | Armor Crack | **NONE FOUND** | DEAD (no live call site) | player | calculateDamage.defenseIgnore | defense-ignore-bucket | No hasEffect() call found anywhere in engine/data code for this id -- registered in EFFECT_DEFS but currently non-functional, not marked inert in its own description. |
| `feinting_edge` | Feinting Edge | js/engine/combat.js:3320; js/engine/combat.js:6974; js/engine/companion.js:471 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `guarded_strike` | Guarded Strike | js/engine/pipeline.js:509; js/engine/pipeline.js:609; js/engine/pipeline.js:903 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `riposte` | Riposte | js/engine/combat.js:5006; js/engine/combat.js:5052; js/engine/combat.js:5109 | rollToHit-defender | player | rollToHit.defender | n/a |  |
| `crushing_impact` | Crushing Impact | js/engine/combat.js:2130; js/engine/pipeline.js:1706 | outgoing-mult | player | calculateDamage.outgoing | conditional |  |
| `deep_cut` | Deep Cut | js/engine/combat.js:2341 | reaction-onHitDealt | player | applyAndReact.onHitDealt | n/a |  |
| `hamstring` | Hamstring | js/engine/combat.js:2345 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `executioner` | Executioner | js/engine/combat.js:1397; js/engine/combat.js:1409 | outgoing-mult | player + plain ally; **not Hadrian kit path** (kind D) | calculateDamage.outgoing | conditional |  |
| `ambush_mastery` | Ambush Mastery | **NONE FOUND** | DEAD (no live call site) | player | (see notes) | n/a | No hasEffect() call found anywhere in engine/data code for this id -- registered in EFFECT_DEFS but currently non-functional, not marked inert in its own description. |
| `evasive_release` | Evasive Release | js/engine/pipeline.js:1893 | rollToHit-defender | player | rollToHit.defender | n/a |  |
| `stalwart` | Stalwart | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — nothing in the game yet reduces the player's Attack |
| `brace` | Brace | js/engine/combat.js:2722; js/engine/combat.js:3933; js/engine/combat.js:3949 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `evasive_guard` | Evasive Guard | js/engine/pipeline.js:374 | reaction-stat | player-only (**kind B**, see asymmetry register) | applyAndReact.* -- REVIEW | n/a |  |
| `spell_ward` | Spell Ward | **NONE FOUND** | DEAD (no live call site) | player | calculateDamage.incoming | incoming-mitigation-bucket | No hasEffect() call found anywhere in engine/data code for this id -- registered in EFFECT_DEFS but currently non-functional, not marked inert in its own description. |
| `concussion_guard` | Concussion Guard | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — nothing in the game yet stuns the player |
| `heatproof` | Heatproof | js/data/actions.js:772 | inert | player | (none -- no live trigger) | n/a | Inert: — nothing in the game yet burns the player |
| `coldproof` | Coldproof | **NONE FOUND** | DEAD (no live call site) | player | (see notes) | n/a | No hasEffect() call found anywhere in engine/data code for this id -- registered in EFFECT_DEFS but currently non-functional, not marked inert in its own description. |
| `corrosionproof` | Corrosionproof | js/engine/combat.js:586; js/engine/combat.js:594 | inert | player | (none -- no live trigger) | n/a | Inert: — those are player-cast effects; nothing in the game yet applies them to the player |
| `surefooted` | Surefooted | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — no such environmental mechanic exists yet |
| `conduit_ease` | Conduit Ease | js/engine/pipeline.js:2340 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `elemental_focus` | Elemental Focus | js/engine/pipeline.js:2377 | outgoing-mult | player | calculateDamage.outgoing | conditional -- REVIEW |  |
| `surging_conduit` | Surging Conduit | js/engine/pipeline.js:2379 | outgoing-mult | player | calculateDamage.outgoing | conditional (one-shot) -- REVIEW |  |
| `regrowth` | Regrowth | js/engine/combat.js:6426 | reaction-heal | player | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `unsettling` | Unsettling | js/engine/combat.js:5983 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `tactical_memory` | Tactical Memory | js/engine/combat.js:3321; js/engine/combat.js:6883; js/engine/companion.js:472 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `kingslayer` | Kingslayer | js/engine/combat.js:878 | outgoing-mult | player | calculateDamage.outgoing | conditional |  |
| `last_stand` | Last Stand | js/engine/combat.js:4387 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `rivers_favor` | River's Favor | js/engine/pipeline.js:2336 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `unbreakable` | Unbreakable | js/engine/combat.js:586; js/engine/combat.js:590 | inert | player | (none -- no live trigger) | n/a | Inert: — nothing in the game yet reduces the player's Defense |
| `blood_debt` | Blood Debt | js/engine/combat.js:6584 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `perfect_balance` | Perfect Balance | js/engine/combat.js:869 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `momentum` | Momentum | js/engine/combat.js:899; js/engine/combat.js:2178; js/engine/pipeline.js:1722 | outgoing-mult | player | calculateDamage.outgoing | stacking |  |
| `spell_echo` | Spell Echo | js/engine/pipeline.js:2441 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `hunters_instinct` | Hunter's Instinct | js/engine/combat.js:888 | outgoing-mult | player | calculateDamage.outgoing | conditional |  |
| `iron_will` | Iron Will | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — nothing in the game yet stuns the player |
| `overwhelming_force` | Overwhelming Force | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — this engine only ever has one enemy per fight; future-proofed for multi-enemy combat |
| `master_duelist` | Master Duelist | js/engine/combat.js:908 | outgoing-mult | player | calculateDamage.outgoing | conditional -- REVIEW |  |
| `second_wind` | Second Wind | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — this engine ends a fight the instant its one enemy dies; there's no multi-enemy encounter for the extra action to happen in |
| `arcane_overflow` | Arcane Overflow | js/engine/combat.js:916 | outgoing-mult | player | calculateDamage.outgoing | burst |  |
| `conduit_mastery` | Conduit Mastery | js/engine/pipeline.js:2335 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `perfect_timing` | Perfect Timing | js/engine/combat.js:6898 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `living_steel` | Living Steel | js/engine/combat.js:856 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `soul_leech` | Soul Leech | js/engine/combat.js:2210; js/engine/pipeline.js:1741 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `temporal_echo` | Temporal Echo | js/engine/combat.js:935 | outgoing-mult | player | calculateDamage.outgoing | burst |  |
| `adaptive_ward` | Adaptive Ward | js/data/actions.js:501; js/data/actions.js:606 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `twin_rivers` | Twin Rivers | js/engine/pipeline.js:2374 | outgoing-mult | player | calculateDamage.outgoing | conditional -- REVIEW |  |
| `execution_protocol` | Execution Protocol | js/engine/combat.js:924 | outgoing-mult | player | calculateDamage.outgoing | burst |  |
| `guardian_spirit` | Guardian Spirit | js/engine/pipeline.js:349 | state-only / lifecycle -- REVIEW | player-only (**kind B**, see asymmetry register) | fight.start / round.start -- REVIEW | n/a |  |
| `master_strategist` | Master Strategist | js/engine/combat.js:6975; js/engine/pipeline.js:2051; js/engine/pipeline.js:2224 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `dual_focus` | Dual Focus | js/engine/parser.js:800 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `master_of_arms` | Master of Arms | js/engine/combat.js:240 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `arcane_convergence` | Arcane Convergence | js/engine/combat.js:2053; js/engine/pipeline.js:1655 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `immutable` | Immutable | js/engine/combat.js:568 | inert | player | (none -- no live trigger) | n/a | Inert: — nothing in this engine ever applies a negative status effect to the player in the first place |
| `battle_scholar` | Battle Scholar | js/engine/combat.js:6723 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `perfect_recall` | Perfect Recall | js/engine/combat.js:6938; js/engine/combat.js:7035; js/engine/pipeline.js:2023 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `conduit_ascendant` | Conduit Ascendant | js/engine/state.js:574; js/engine/state.js:576 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `living_legacy` | Living Legacy | js/engine/combat.js:6730 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `mirror_soul` | Mirror Soul | js/engine/pipeline.js:430 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `echoing_arsenal` | Echoing Arsenal | js/engine/combat.js:2144; js/engine/pipeline.js:1710 | outgoing-mult | player | calculateDamage.outgoing | burst |  |
| `world_walker` | World Walker | js/engine/pipeline.js:2308 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `fatewoven` | Fatewoven | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — the player's own attacks in this engine always deal at least 1 damage; there's no miss/failure state on an outgoing hit to reroll |
| `titans_endurance` | Titan's Endurance | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — nothing in this engine ever reduces the player's base Defense; every combat modifier is an additive bonus layered on top of it, never a subtraction from it |
| `river_harmony` | River Harmony | **NONE FOUND** | DEAD (no live call site) | player | (see notes) | n/a | No hasEffect() call found anywhere in engine/data code for this id -- registered in EFFECT_DEFS but currently non-functional, not marked inert in its own description. |
| `empty_hand` | The Empty Hand | js/engine/state.js:521 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `living_current` | Living Current | js/engine/combat.js:1050 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `rooted_resolve` | Rooted Resolve | js/engine/combat.js:6110 | reaction-heal | player | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `flourishing_soul` | Flourishing Soul | js/engine/combat.js:1008 | reaction-heal | player | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `seedbearer` | Seedbearer | js/engine/pipeline.js:2328 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `natures_persistence` | Nature's Persistence | js/engine/combat.js:576 | inert | player | (none -- no live trigger) | n/a | Inert: — nothing in this engine applies crowd control to the player; enemies have no abilities or actions of their own yet |
| `endless_bloom` | Endless Bloom | js/engine/combat.js:6001 | reaction-heal | player | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `gentle_crossing` | Gentle Crossing | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — this engine has no Mana resource (only a static Magic stat, nothing depletable to restore a percentage of), and since every encounter here is a single enemy, a kill always ends the fight before a mid-fight cooldown reduction could ever matter |
| `between_worlds` | Between Worlds | js/engine/combat.js:4394 | cheatDeath | player | cheatDeath | n/a |  |
| `rest_eternal` | Rest Eternal | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — no creature in this engine has any such mechanic yet; future-proofing for when bosses gain one |
| `passing_whisper` | Passing Whisper | js/engine/combat.js:6458 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `calm_beyond_fear` | Calm Beyond Fear | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — nothing in this engine applies morale/fear effects to the player; enemies have no abilities or actions of their own yet |
| `soul_ledger` | Soul Ledger | js/engine/combat.js:6473 | cheatDeath | player | cheatDeath | n/a |  |
| `foreseen_strike` | Foreseen Strike | js/engine/combat.js:1453 | defense-ignore | player | calculateDamage.defenseIgnore | defense-ignore-bucket |  |
| `redirected_fate` | Redirected Fate | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — this engine has no concept of enemies landing a critical hit against the player; enemy attacks are a flat roll with no crit mechanic of their own yet |
| `threads_intertwined` | Threads Intertwined | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — every effect in this engine is a bespoke check hand-wired at its own specific call site; there's no generic 'a passive just activated' event to hook a cross-passive trigger into without re-architecting the whole effects system |
| `every_choice_matters` | Every Choice Matters | js/engine/combat.js:5135 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `guided_footsteps` | Guided Footsteps | js/engine/pipeline.js:353 | state-only / lifecycle -- REVIEW | player-only (**kind B**, see asymmetry register) | fight.start / round.start -- REVIEW | n/a |  |
| `weavers_insight` | Weaver's Insight | js/engine/combat.js:5959 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `worthy_challenge` | Worthy Challenge | js/engine/combat.js:1873; js/engine/combat.js:2181; js/engine/pipeline.js:1725 | outgoing-mult | player | calculateDamage.outgoing | stacking |  |
| `unbroken_line` | Unbroken Line | js/engine/combat.js:4671 | incoming-mitigation | player | calculateDamage.incoming | incoming-mitigation-bucket |  |
| `battle_tempered` | Battle Tempered | js/engine/combat.js:4071 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `victors_momentum` | Victor's Momentum | js/engine/combat.js:6741 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `clash_of_steel` | Clash of Steel | js/data/actions.js:820 | outgoing-mult | player | calculateDamage.outgoing | conditional -- REVIEW |  |
| `rally_the_line` | Rally the Line | js/engine/combat.js:6143 | reaction-heal | player | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `endless_study` | Endless Study | js/engine/combat.js:1547 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `prepared_response` | Prepared Response | js/engine/combat.js:1564 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `expanding_mind` | Expanding Mind | js/engine/combat.js:965 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `eureka` | Eureka | js/engine/pipeline.js:2344 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `precision_formula` | Precision Formula | js/engine/combat.js:1523 | defense-ignore | player | calculateDamage.defenseIgnore | defense-ignore-bucket |  |
| `archive_eternal` | Archive Eternal | js/engine/combat.js:6492 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `compassions_grace` | Compassion's Grace | js/engine/combat.js:1060 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `shared_burden` | Shared Burden | js/engine/combat.js:1578 | reaction-heal | player | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `unwavering_devotion` | Unwavering Devotion | js/engine/combat.js:4081 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `faithful_heart` | Faithful Heart | js/engine/combat.js:1912 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `calming_presence` | Calming Presence | js/engine/combat.js:1589 | incoming-mitigation | player | calculateDamage.incoming | incoming-mitigation-bucket |  |
| `love_endures` | Love Endures | js/engine/combat.js:6128 | reaction-heal | player | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `loaded_dice` | Loaded Dice | js/engine/combat.js:1502 | outgoing-mult | player | calculateDamage.outgoing | variance |  |
| `fortunes_favor` | Fortune's Favor | js/engine/combat.js:571 | inert | player | (none -- no live trigger) | n/a | Inert: — nothing in this engine ever applies a negative status effect to the player (see Immutable/Nature's Persistence for the same limitation), so there's nothing for this to ever intercept |
| `winds_of_change` | Winds of Change | js/engine/combat.js:4091 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `unlikely_outcome` | Unlikely Outcome | js/engine/combat.js:5202 | outgoing-mult/crit-adjacent | player | calculateDamage.outgoing | crit (or stat.critChance) -- REVIEW |  |
| `never_where_expected` | Never Where Expected | js/engine/pipeline.js:357 | rollToHit-attacker | player-only (**kind B**, see asymmetry register) | rollToHit.attacker | n/a |  |
| `double_or_nothing` | Double or Nothing | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — this engine has no generic 'the effect of whatever ability just resolved' interface to double or cancel after the fact (abilities range from flat damage to buffs to cooldown-gated tactics, each with its own bespoke resolution), and no interactive per-action opt-in prompt a player could choose to invoke or decline mid-action |
| `stones_patience` | Stone's Patience | js/engine/combat.js:2037; js/engine/pipeline.js:1642 | outgoing-mult | player | calculateDamage.outgoing | conditional |  |
| `unyielding_wall` | Unyielding Wall | js/engine/combat.js:1647 | reaction-heal | player | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `bedrock` | Bedrock | js/engine/combat.js:405 | inert | player | (none -- no live trigger) | n/a | Inert: — nothing in this engine ever reduces the player's own Defense stat (Corrode/Armor Crack/Disarm all only ever reduce the ENEMY's numbers), so there's no reduction for this to ever floor |
| `ordered_mind` | Ordered Mind | js/engine/combat.js:578 | inert | player | (none -- no live trigger) | n/a | Inert: — the same reason as Fortune's Favor: no negative status effect mechanic exists on the player side to ever resist or ignore |
| `grounded` | Grounded | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — the item's own description calls this 'future-proofed for later mechanics,' and indeed none of those mechanics exist yet |
| `lasting_foundation` | Lasting Foundation | js/engine/combat.js:4225 | reaction-heal | player | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `momentum_unbound` | Momentum Unbound | js/engine/combat.js:1664; js/engine/combat.js:1743 | outgoing-mult | player | calculateDamage.outgoing | stacking |  |
| `open_road` | Open Road | js/engine/combat.js:1846 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `unbound_spirit` | Unbound Spirit | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — the same standing reason as every CC-immunity effect so far: no enemy-applied control mechanic exists yet on the player side; deferred to the promised future enemy rework |
| `wanderers_reward` | Wanderer's Reward | js/engine/combat.js:1771 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `swift_passage` | Swift Passage | js/engine/combat.js:6753 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `trailblazer` | Trailblazer | js/engine/combat.js:1819; js/engine/combat.js:1827 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `tempered_steel` | Tempered Steel | js/engine/combat.js:1675; js/engine/combat.js:2173; js/engine/pipeline.js:1717 | outgoing-mult | player | calculateDamage.outgoing | stacking |  |
| `reinforced` | Reinforced | js/engine/pipeline.js:177 | reaction-stat | player-only (**kind B**, see asymmetry register) | applyAndReact.* -- REVIEW | n/a |  |
| `crafted_perfection` | Crafted Perfection | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — the same reason as Threads Intertwined (Regalia of the Woven Thread): every effect in this engine is a bespoke check hand-wired at its own specific call site, with no generic 'a passive just activated' event to hook a blanket first-activation amplifier into without re-architecting the whole effects system |
| `work_refines` | Work Refines | js/engine/combat.js:4236 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `master_craftsman` | Master Craftsman | js/engine/combat.js:2134; js/engine/pipeline.js:1707 | outgoing-mult | player | calculateDamage.outgoing | conditional |  |
| `living_forge` | Living Forge | js/engine/combat.js:3994 | reaction-heal | player | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `flowing_waters` | Flowing Waters | js/engine/combat.js:4244 | reaction-heal | player | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `cleansing_current` | Cleansing Current | js/engine/combat.js:812 | inert | player | (none -- no live trigger) | n/a | Inert: — nothing in this engine ever applies a negative status effect to the player, so there's nothing for this to ever remove |
| `adaptive_tide` | Adaptive Tide | js/engine/combat.js:1633; js/engine/combat.js:1637; js/engine/combat.js:6085 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `mercys_gift` | Mercy's Gift | js/engine/combat.js:1028 | reaction-heal | player | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `patient_current` | Patient Current | js/engine/combat.js:4255 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `calm_waters` | Calm Waters | js/engine/combat.js:821 | inert | player | (none -- no live trigger) | n/a | Inert: — the same reason as Cleansing Current: nothing in this engine ever applies a negative status effect to the player, so this can never trigger |
| `borrowed_seconds` | Borrowed Seconds | js/engine/combat.js:1697 | outgoing-mult | player | calculateDamage.outgoing | stacking or burst -- REVIEW |  |
| `timeless_guard` | Timeless Guard | js/engine/combat.js:1707 | state-only / lifecycle -- REVIEW | player-only (**kind B**, see asymmetry register) | fight.start / round.start -- REVIEW | n/a |  |
| `perfect_memory` | Perfect Memory | js/engine/combat.js:1798 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `moment_preserved` | Moment Preserved | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: — this engine represents buffs as 3 shared Attack/Defense/Magic duration fields (Math |
| `unhurried_step` | Unhurried Step | js/engine/combat.js:2475 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `hourglass_reserve` | Hourglass Reserve | js/engine/combat.js:5828 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `dra_e01_ice_forged_edge` | Ice-Forged Edge | js/data/actions.js:536; js/data/actions.js:642 | outgoing-mult | player | calculateDamage.outgoing | stacking or burst -- REVIEW |  |
| `dra_e02_unshaken_command` | Unshaken Command | js/engine/combat.js:4728 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `dra_e03_flowing_guard` | Flowing Guard | **NONE FOUND** | DEAD (no live call site) | player | (see notes) | n/a | No hasEffect() call found anywhere in engine/data code for this id -- registered in EFFECT_DEFS but currently non-functional, not marked inert in its own description. |
| `dra_e04_unbroken_grip` | Unbroken Grip | js/data/actions.js:537; js/data/actions.js:643 | outgoing-mult | player | calculateDamage.outgoing | conditional (one-shot) -- REVIEW |  |
| `dra_e05_sure_foundation` | Sure Foundation | js/engine/combat.js:2156; js/engine/pipeline.js:842; js/engine/pipeline.js:892 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `dra_e06_executioners_seal` | Executioner's Seal | js/data/actions.js:543; js/data/actions.js:651 | outgoing-mult | player | calculateDamage.outgoing | conditional -- REVIEW |  |
| `dra_e07_unquenched_focus` | Unquenched Focus | js/data/actions.js:497; js/data/actions.js:602 | outgoing-mult | player | calculateDamage.outgoing | conditional (one-shot) -- REVIEW |  |
| `dra_e08_ashward` | Ashward | js/data/actions.js:750 | outgoing-mult | player | calculateDamage.outgoing | conditional -- REVIEW |  |
| `dra_e09_black_ice_reserve` | Black-Ice Reserve | js/engine/pipeline.js:552; js/engine/pipeline.js:630; js/data/actions.js:544 | outgoing-mult | player | calculateDamage.outgoing | conditional -- REVIEW |  |
| `dra_e10_venom_tempering` | Venom Tempering | **NONE FOUND** | inert | player | (none -- no live trigger) | n/a | Inert: for any enemy wearer — this engine has no mechanic for the player to inflict a poison/venom damage-over-time on an enemy (only Burn and Bleed exist on that side), so there is nothing for this to ever reduce |
| `sang_sec_ie005_gatekeepers_stand` | Gatekeeper's Stand | js/engine/combat.js:3765 (via ALLY_PROTECTION_EFFECT_IDS); js/engine/combat.js:3767 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `sang_sec_ie010_protective_intercession` | Protective Intercession | js/engine/combat.js:3765 (via ALLY_PROTECTION_EFFECT_IDS); js/engine/combat.js:3767 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `sang_cu_ie010_officers_intercession` | Officer's Intercession | js/engine/combat.js:3765 (via ALLY_PROTECTION_EFFECT_IDS); js/engine/combat.js:3767 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `sang_cu_ie002_marked_target` | Marked Target | js/engine/pipeline.js:519; js/engine/pipeline.js:617 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `sang_cu_ie003_serrated_opening` | Serrated Opening | js/engine/pipeline.js:511; js/engine/pipeline.js:611 | reaction-onHitDealt | player | applyAndReact.onHitDealt | n/a |  |
| `sang_cu_ie006_smugglers_guard` | Smuggler's Guard | js/engine/combat.js:3910 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `sang_cu_ie007_duelists_measure` | Duelist's Measure | js/engine/pipeline.js:298; js/engine/pipeline.js:327; js/engine/pipeline.js:523 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `sang_cu_ie008_handlers_resilience` | Handler's Resilience | js/engine/combat.js:4976 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `sang_cu_ie009_hunters_call` | Hunter's Call | js/engine/combat.js:3627 (via BOARDING_SUMMON_BUFF_EFFECT_IDS); js/engine/combat.js:3628 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `sang_cu_ie011_commanders_poise` | Commander's Poise | js/engine/combat.js:3914 | outgoing-mult | player | calculateDamage.outgoing | conditional (one-shot) -- REVIEW |  |
| `sang_cu_ie012_tyrants_edge` | Tyrant's Edge | js/data/actions.js:545; js/data/actions.js:653 | outgoing-mult | player | calculateDamage.outgoing | conditional -- REVIEW |  |
| `sang_cu_ie013_conquerors_resolve` | Conqueror's Resolve | js/engine/combat.js:4981 | reaction-heal | player | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `sang_mil_ie001_hardened_formation` | Hardened Formation | js/engine/combat.js:1950 (via ONE_HIT_MITIGATION_EFFECT_IDS); js/engine/combat.js:1952 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `sang_mil_ie003_calculated_aim` | Calculated Aim | js/engine/pipeline.js:300; js/engine/pipeline.js:331 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `sang_mil_ie005_decisive_impact` | Decisive Impact | js/data/actions.js:568; js/data/actions.js:647 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `sang_mil_ie006_boarding_discipline` | Boarding Discipline | js/engine/combat.js:3627 (via BOARDING_SUMMON_BUFF_EFFECT_IDS); js/engine/combat.js:3628 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `sang_mil_ie007_officers_bearing` | Officer's Bearing | js/engine/combat.js:1950 (via ONE_HIT_MITIGATION_EFFECT_IDS); js/engine/combat.js:1952 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `sang_mil_ie008_imperial_authority` | Imperial Authority | js/engine/combat.js:3700 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `sang_sec_ie004_watchmans_resilience` | Watchman's Resilience | js/engine/combat.js:1950 (via ONE_HIT_MITIGATION_EFFECT_IDS); js/engine/combat.js:1952 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `sang_sec_ie007_duelists_bulwark` | Duelist's Bulwark | js/engine/combat.js:1983 (via REPEATABLE_MITIGATION_EFFECT_IDS); js/engine/combat.js:1985 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `sang_iag_ie002_contractors_endurance` | Contractor's Endurance | js/engine/combat.js:1950 (via ONE_HIT_MITIGATION_EFFECT_IDS); js/engine/combat.js:1952 | outgoing-mult | player | calculateDamage.outgoing | conditional (one-shot) -- REVIEW |  |
| `sang_iag_ie003_measured_aim` | Measured Aim | js/engine/pipeline.js:306; js/engine/pipeline.js:337 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `sang_iag_ie004_company_standard` | Company Standard | js/engine/combat.js:3713 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `sang_iag_ie006_champions_poise` | Champion's Poise | js/engine/combat.js:1983 (via REPEATABLE_MITIGATION_EFFECT_IDS); js/engine/combat.js:1985 | reaction-cooldown | player | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `sang_iag_ie007_concealed_edge` | Concealed Edge | js/engine/pipeline.js:300; js/engine/pipeline.js:331 | reaction-stat | player | applyAndReact.* -- REVIEW | n/a |  |
| `sang_iag_ie008_toxic_preparation` | Toxic Preparation | js/data/actions.js:575; js/data/actions.js:674 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |
| `sang_iag_ie010_rallying_standard` | Rallying Standard | js/engine/combat.js:3721 | state-only / lifecycle -- REVIEW | player | fight.start / round.start -- REVIEW | n/a |  |

---

## 2. Set Bonuses

Only tiers with a `special` id or an `effects:[...]` reference are listed (110 of 144 total SETS tiers) -- the other 35 are flat `bonuses:{...}` stat tiers already handled by `stat()`, out of this catalogue's scope.

| id | special/effect id | call site(s) | kind | proposed hook | proposed bucket | notes |
|---|---|---|---|---|---|---|
| `Vaeloris:4` | `vaeloris_natures_grace` | **NONE FOUND** | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Vaeloris:6` | `vaeloris_forest_guardian` | js/engine/combat.js:6430 | reaction-stat | applyAndReact.* -- REVIEW | n/a |  |
| `Thraekor:2` | `thraekor_heatproof_immunity` | **NONE FOUND** | inert | (none -- no live trigger) | n/a | Inert: — nothing burns the player yet) |
| `Thraekor:6` | `thraekor_forgeborn` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Sahrimor:2` | `sahrimor_merchants_eye_10` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Sahrimor:4` | `sahrimor_trailwise_20` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Sahrimor:6` | `master_merchant` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Norrvael:4` | `norrvael_ambush_sense_50` | **NONE FOUND** | inert | (none -- no live trigger) | n/a | Inert: — no enemy-ambush mechanic yet) |
| `Norrvael:6` | `norrvael_silent_hunter` | js/engine/combat.js:2317 | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Kabal:4` | `kabal_elemental_focus_115` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Kabal:6` | `kabal_river_mastery` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Legion:4` | `legion_shield_wall` | js/engine/combat.js:1388 | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Legion:6` | `legion_disciplined_formation` | js/engine/combat.js:6994 | reaction-stat | applyAndReact.* -- REVIEW | n/a |  |
| `Legion:8` | `hold_the_line` | js/engine/combat.js:6095 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Vanguard:4` | `vanguard_crushing_135` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Vanguard:6` | `vanguard_executioner_40` | **NONE FOUND** | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Scout Corps:4` | `scoutcorps_trailwise_20` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Scout Corps:6` | `scoutcorps_ambush_170` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Siege Corps:4` | `siegecorps_armorcrack_4` | **NONE FOUND** | defense-ignore | calculateDamage.defenseIgnore | defense-ignore-bucket |  |
| `Siege Corps:6` | `siegecorps_brace_atk` | js/engine/combat.js:6998; js/engine/pipeline.js:2406 | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Novitiate:4` | `novitiate_focus_112` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Novitiate:6` | `novitiate_free_first_cast` | js/engine/pipeline.js:2336 | reaction-cooldown | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `Examiner:4` | `examiner_spellward_20` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Examiner:6` | `examiner_tacticalmemory_50` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Conduit Master:4` | `conduitmaster_ease_40` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Conduit Master:6` | `conduitmaster_surging_twice` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `River Warden:4` | `riverwarden_spellward_20` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `River Warden:6` | `riverwarden_resist_magic` | js/engine/pipeline.js:375; js/data/actions.js:616 | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Mugamiir Safor:4` | `mugamiirsafor_merchantseye_10` | **NONE FOUND** | inert | (none -- no live trigger) | n/a | Inert: — no shop system yet) |
| `Mugamiir Safor:6` | `mugamiirsafor_contract_10` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Courier:4` | `courier_trailwise_20` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Courier:6` | `courier_travel_75` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Contract Hunter:4` | `contracthunter_executioner_40` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Contract Hunter:6` | `vanguard_momentum` | js/engine/combat.js:6441 | reaction-stat | applyAndReact.* -- REVIEW | n/a |  |
| `Master Appraiser:4` | `masterappraiser_merchantseye_15` | **NONE FOUND** | inert | (none -- no live trigger) | n/a | Inert: — no shop system yet) |
| `Master Appraiser:6` | `masterappraiser_loot_120` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Ashforged:4` | `ashforged_heatproof_immunity` | **NONE FOUND** | inert | (none -- no live trigger) | n/a | Inert: — nothing burns the player yet) |
| `Ashforged:6` | `ashforged_crushing_140` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Stonewarden:4` | `stonewarden_brace_5` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Stonewarden:6` | `stonewarden_first_hit_75` | js/engine/combat.js:6857; js/data/actions.js:516; js/data/actions.js:624 | outgoing-mult | calculateDamage.outgoing | conditional (one-shot) -- REVIEW |  |
| `Heartwood:4` | `heartwood_regrowth_10` | **NONE FOUND** | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Heartwood:6` | `heartwood_vitality` | js/engine/combat.js:2440 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Canopy Ranger:4` | `canopyranger_ambushsense_50` | **NONE FOUND** | inert | (none -- no live trigger) | n/a | Inert: — no enemy-ambush mechanic yet) |
| `Canopy Ranger:6` | `canopyranger_ranged_130` | **NONE FOUND** | inert | (none -- no live trigger) | n/a | Inert: — no ranged/melee distinction exists) |
| `Sandstrider:4` | `sandstrider_heatproof_trailwise` | **NONE FOUND** | inert | (none -- no live trigger) | n/a | Inert: ) and Trailwise outright |
| `Sandstrider:6` | `sandstrider_contract_10` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Tide Merchant:4` | `tidemerchant_merchantseye_10` | **NONE FOUND** | inert | (none -- no live trigger) | n/a | Inert: — no shop system yet) |
| `Tide Merchant:6` | `tidemerchant_jobgold_5` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Stormwatch:4` | `stormwatch_spellward_20` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Stormwatch:6` | `storm_barrier` | js/data/actions.js:512; js/data/actions.js:620 | incoming-mitigation | calculateDamage.incoming | incoming-mitigation-bucket |  |
| `White Watch:4` | `whitewatch_riposte_75` | **NONE FOUND** | reaction-onZeroDamage | applyAndReact.onZeroDamage | n/a |  |
| `White Watch:6` | `whitewatch_riposte_def` | js/data/actions.js:830 | reaction-onZeroDamage | applyAndReact.onZeroDamage | n/a |  |
| `Lizardfolk:4` | `lizardfolk_corrosionproof_full` | **NONE FOUND** | inert | (none -- no live trigger) | n/a | Inert: — nothing corrodes the player yet) |
| `Lizardfolk:6` | `marsh_survivor` | **NONE FOUND** | inert | (none -- no live trigger) | n/a | Inert: — Bleed (Deep Cut) only ever afflicts the enemy, never the player |
| `Drake Hunter:4` | `drakehunter_executioner_40` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Drake Hunter:6` | `dragonslayer` | js/engine/combat.js:1419 | outgoing-mult | calculateDamage.outgoing | conditional |  |
| `Queen Carapace:4` | `queencarapace_corrosionproof_stalwart` | **NONE FOUND** | inert | (none -- no live trigger) | n/a | Inert: ) |
| `Queen Carapace:6` | `carapace_adaptation` | js/engine/combat.js:6089 | reaction-stat | applyAndReact.* -- REVIEW | n/a |  |
| `Elder Bark:4` | `elderbark_regrowth_10` | **NONE FOUND** | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Elder Bark:6` | `elderbark_survive_1hp` | js/engine/combat.js:4383 | cheatDeath | cheatDeath | n/a |  |
| `Bonecaller:4` | `bonecaller_deepcut_35` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Bonecaller:6` | `bleed_exploitation` | js/engine/combat.js:1427 | outgoing-mult | calculateDamage.outgoing | conditional |  |
| `Leviathan:4` | `leviathan_coldproof_spellward` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Leviathan:6` | `leviathan_water_heal_75` | **NONE FOUND** | outgoing-mult | calculateDamage.outgoing | conditional -- REVIEW |  |
| `First Kingdom:4` | `firstkingdom_tacticalmemory_50` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `First Kingdom:6` | `firstkingdom_cooldowns` | js/engine/combat.js:6975; js/engine/pipeline.js:2051; js/engine/pipeline.js:2224 | reaction-cooldown | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `Pre-Kabal:4` | `prekabal_focus_120` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Pre-Kabal:6` | `prekabal_generic_synergy_140` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Fragmenta:4` | `fragmenta_surging_twice` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Fragmenta:6` | `fragmenta_matchups_150` | **NONE FOUND** | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Regalia of the First Bloom:2` | `blessing_of_renewal` | js/engine/combat.js:4211 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the First Bloom:4` | `overflowing_life` | js/engine/combat.js:1042 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the First Bloom:6` | `avatar_of_bloom` | js/engine/combat.js:6164 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the Final Veil:2` | `blessing_of_acceptance` | js/engine/combat.js:584 | inert | (none -- no live trigger) | n/a | Inert: — nothing in this engine ever applies a negative status effect to the player to shorten |
| `Regalia of the Final Veil:4` | `mercy_of_the_veil` | js/engine/combat.js:841 | inert | (none -- no live trigger) | n/a | Inert: — same reason as Blessing of Acceptance; there's nothing to remove |
| `Regalia of the Final Veil:6` | `avatar_of_passing` | js/engine/combat.js:6190 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the Woven Thread:2` | `blessing_of_guidance` | js/engine/combat.js:1478 | outgoing-mult/crit-adjacent | calculateDamage.outgoing | crit (or stat.critChance) -- REVIEW |  |
| `Regalia of the Woven Thread:4` | `threads_of_consequence` | js/engine/combat.js:5148 | outgoing-mult | calculateDamage.outgoing | burst |  |
| `Regalia of the Woven Thread:6` | `avatar_of_fate` | js/engine/combat.js:4401; js/engine/combat.js:6208 | outgoing-mult/crit-adjacent | calculateDamage.outgoing | crit (or stat.critChance) -- REVIEW |  |
| `Regalia of the Crimson Vanguard:2` | `blessing_of_valor` | js/engine/combat.js:1883; js/engine/combat.js:6596 | outgoing-mult | calculateDamage.outgoing | conditional |  |
| `Regalia of the Crimson Vanguard:4` | `commanding_presence` | js/engine/combat.js:1894 | defense-ignore | calculateDamage.defenseIgnore | defense-ignore-bucket |  |
| `Regalia of the Crimson Vanguard:6` | `avatar_of_war` | js/engine/combat.js:6229 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the Endless Archive:2` | `blessing_of_insight` | js/engine/combat.js:1479; js/engine/combat.js:5972 | outgoing-mult/crit-adjacent | calculateDamage.outgoing | crit (or stat.critChance) -- REVIEW |  |
| `Regalia of the Endless Archive:4` | `universal_understanding` | js/engine/pipeline.js:2362 | reaction-cooldown | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `Regalia of the Endless Archive:6` | `avatar_of_knowledge` | js/engine/combat.js:6251 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the Eternal Heart:2` | `blessing_of_compassion` | js/engine/combat.js:1014 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the Eternal Heart:4` | `heartward_bond` | js/engine/combat.js:1913 | reaction-stat | applyAndReact.* -- REVIEW | n/a |  |
| `Regalia of the Eternal Heart:6` | `avatar_of_devotion` | js/engine/combat.js:4415; js/engine/combat.js:6273 | incoming-mitigation | calculateDamage.incoming | incoming-mitigation-bucket |  |
| `Regalia of the Laughing Gale:2` | `blessing_of_fortune` | js/engine/combat.js:1484; js/engine/combat.js:2190; js/engine/pipeline.js:1729 | outgoing-mult/crit-adjacent | calculateDamage.outgoing | crit (or stat.critChance) -- REVIEW |  |
| `Regalia of the Laughing Gale:4` | `twist_of_fate` | js/engine/combat.js:5176 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the Laughing Gale:6` | `avatar_of_chaos` | js/engine/combat.js:6296 | outgoing-mult | calculateDamage.outgoing | variance |  |
| `Regalia of the Eternal Bastion:2` | `blessing_of_stone` | js/engine/combat.js:1606 | incoming-mitigation | calculateDamage.incoming | incoming-mitigation-bucket |  |
| `Regalia of the Eternal Bastion:4` | `walls_endure` | js/engine/combat.js:4647 | reaction-stat | applyAndReact.* -- REVIEW | n/a |  |
| `Regalia of the Eternal Bastion:6` | `avatar_of_endurance` | js/engine/combat.js:6314 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the Endless Horizon:2` | `blessing_of_freedom` | js/engine/combat.js:1856; js/engine/pipeline.js:360 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the Endless Horizon:4` | `ever_forward` | js/engine/combat.js:1749 | reaction-stat | applyAndReact.* -- REVIEW | n/a |  |
| `Regalia of the Endless Horizon:6` | `avatar_of_freedom` | js/engine/combat.js:6337 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the Eternal Forge:2` | `blessing_of_creation` | js/engine/combat.js:1728 | state-only / lifecycle -- REVIEW | fight.start / round.start -- REVIEW | n/a |  |
| `Regalia of the Eternal Forge:4` | `perfected_craft` | **NONE FOUND** | inert | (none -- no live trigger) | n/a | Inert: — doubling every 'once per combat' gate in this engine (Guardian Spirit, Rooted Resolve, Rally the Line, Blessing of Valor, Shared Burden, Love Endures, every 'Avatar of X' trigger, every cheat-death save, etc |
| `Regalia of the Eternal Forge:6` | `avatar_of_creation` | js/engine/combat.js:6359 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the Endless Tide:2` | `blessing_of_the_tide` | js/engine/combat.js:5947 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the Endless Tide:4` | `endless_current` | js/engine/combat.js:1070 | reaction-stat | applyAndReact.* -- REVIEW | n/a |  |
| `Regalia of the Endless Tide:6` | `avatar_of_renewal` | js/engine/combat.js:6386 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the Eternal Hour:2` | `blessing_of_the_hour` | js/engine/combat.js:3986 | reaction-cooldown | applyAndReact.* / chooseAction -- REVIEW | n/a |  |
| `Regalia of the Eternal Hour:4` | `keeper_of_history` | js/engine/combat.js:6607 | reaction-heal | applyAndReact.onHitDealt / round.start / fight.end -- REVIEW | n/a |  |
| `Regalia of the Eternal Hour:6` | `avatar_of_time` | js/engine/combat.js:6411 | outgoing-mult | calculateDamage.outgoing | burst |  |
| `First Sword's Regalia:6` | `flowing_discipline` | js/engine/combat.js:2896; js/data/actions.js:553; js/data/actions.js:658 | outgoing-mult | calculateDamage.outgoing | conditional (one-shot) -- REVIEW |  |
| `First Sword's Regalia:8` | `winters_verdict` | js/data/actions.js:564; js/data/actions.js:666 | outgoing-mult | calculateDamage.outgoing | conditional (one-shot) -- REVIEW |  |
| `First Sword's Regalia:10` | `first_swords_legacy` | js/engine/combat.js:2948; js/data/actions.js:153 | reaction-stat | applyAndReact.* -- REVIEW | n/a |  |
| `First Sword's Regalia:10` | `elemental_sovereignty` | js/engine/combat.js:2948; js/data/actions.js:153 | rollToHit-attacker | rollToHit.attacker | n/a |  |

---

## 3. Enemy Passives (by trigger type)

169 passive entries in `ENEMY_ABILITIES` (`js/data/enemyabilities.js`), organized by their 64 unique `trigger` values -- already data-driven; this table maps each trigger to a proposed registry hook rather than listing all 169 individually.

| trigger type | count | example id(s) | dispatch site(s) | proposed hook |
|---|---|---|---|---|
| `healthBelowPct` | 18 | `cornered`, `apex_predator` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | fight-lifecycle (threshold watch, not a fixed round/turn hook) -- REVIEW |
| `onHitTaken` | 5 | `barbed_hide`, `quills` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onHitTaken |
| `critAlwaysBleeds` | 1 | `iron_tusks` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onHitDealt |
| `everyPctHealthLostStacking` | 7 | `kings_fury`, `sky_sovereign` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onHitTaken (stacking state) |
| `flatDamageReduction` | 11 | `thick_hide`, `thick_hide_2` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | calculateDamage.incoming |
| `healthStagedBuff` | 1 | `unyielding` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | fight-lifecycle (threshold watch) -- REVIEW |
| `onKill` | 2 | `predators_momentum`, `roadlords_momentum` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onKill |
| `regenPerTurn` | 5 | `ancient_resilience`, `rootbound` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | round.start |
| `ignoresAmbush` | 1 | `keen_senses` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | rollToHit.defender |
| `packCount` | 5 | `pack_hunter`, `swarm` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | fight.start (reads party composition once) |
| `bonusVsStatus` | 3 | `crushing_jaws`, `butchers_instinct` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | calculateDamage.outgoing (conditional on target status) |
| `firstAttack` | 13 | `ambush_bonus`, `forest_camouflage` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | calculateDamage.outgoing (conditional, one-shot) |
| `elementalResist` | 4 | `winter_coat`, `ash_hide` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | calculateDamage.incoming (damage-type tag, not the bucket -- REVIEW vs T2) |
| `consecutiveSameTarget` | 1 | `relentless_pursuit` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | calculateDamage.outgoing (stacking, per-target state) |
| `onOpponentStatusStart` | 1 | `blood_frenzy` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onStatusApplied |
| `leaderAura` | 7 | `alphas_command`, `lord_of_the_pack` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | stat.<key> (party-wide, fight.start recompute) |
| `combatStartBuff` | 1 | `tunnel_fighter` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | fight.start |
| `critInflictsCustom` | 1 | `powerful_bite` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onHitDealt (crit-conditional) |
| `onAllyDeath` | 1 | `endless_swarm` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onDowned / onKill (ally-side) -- REVIEW |
| `bonusVsAnyStatus` | 1 | `opportunist` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | calculateDamage.outgoing (conditional) |
| `bonusVsHealthAbovePct` | 1 | `killer_instinct` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | calculateDamage.outgoing (conditional) |
| `afterNHitsFromSameTarget` | 1 | `adaptive_fighter` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onHitTaken (stacking counter) |
| `flatDamageBonus` | 1 | `tool_mastery` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | calculateDamage.outgoing (conditional or stat.atk -- REVIEW) |
| `onHitLanded` | 1 | `relentless_chase` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onHitDealt |
| `periodicRandomBuff` | 1 | `primal_adaptation` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | round.start (variance) |
| `healthAboveBuff` | 1 | `reinforced_bones` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | fight-lifecycle (threshold watch) -- REVIEW |
| `reformOnDeath` | 1 | `reassemble` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onDowned (cheat-death-adjacent) -- REVIEW |
| `defensePenetration` | 1 | `runic_bones` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | calculateDamage.defenseIgnore |
| `combatStartDebuff` | 3 | `draconic_presence`, `predators_presence` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | fight.start |
| `onAllyPassiveStack` | 1 | `ancient_instinct` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.* (cross-ally trigger) -- REVIEW |
| `adaptToRepeatedAbility` | 2 | `draconic_insight`, `ancient_draconic_insight` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onHitTaken (per-ability counter) |
| `onPlayerElementalStatusInflicted` | 1 | `sovereign_territory` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onStatusApplied |
| `periodicTemporaryShield` | 1 | `diamond_shell` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | round.start |
| `independentMissChance` | 2 | `mirror_scales`, `illusory_form` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | rollToHit.attacker (self-miss chance) |
| `onMirrorScalesProc` | 2 | `distorted_reality`, `perfect_illusion` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.* (reflect-adjacent) -- REVIEW |
| `onActiveUse` | 7 | `crystal_momentum`, `blink_predator` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | chooseAction (post-use hook) -- REVIEW |
| `bonusVsHealthBelowPctAlways` | 1 | `apex_instinct` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | calculateDamage.outgoing (conditional) |
| `onPlayerIntimidated` | 1 | `sovereign_predator` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onStatusApplied |
| `onCrit` | 1 | `master_canopy_hunter` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onHitDealt (crit-conditional) |
| `periodicFormToggle` | 1 | `elemental_form` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | round.start |
| `onFormToggle` | 1 | `arcane_core` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.* (state transition) -- REVIEW |
| `castActiveOnDeath` | 1 | `volatile_corpse` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onDowned (death-trigger) |
| `onAlliedSulDaunDeath` | 1 | `unending_horde` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onAllyDeath (named-creature-specific) -- REVIEW |
| `markedQuarrySelect` | 1 | `unfinished_vengeance` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | fight.start (target selection) |
| `accuracyReductionImmune` | 2 | `living_memory`, `veil_of_agony` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | rollToHit.attacker (immunity gate) |
| `heartCheatDeath` | 1 | `four_living_hearts` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | cheatDeath |
| `stunKnockbackImmune` | 1 | `unstoppable_momentum` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onStatusApplied (immunity gate) |
| `damageCapPctMaxHp` | 1 | `perfect_fleshcraft` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | calculateDamage.incoming (cap, not the mitigation bucket) -- REVIEW |
| `etherealToggle` | 1 | `ethereal_form` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | round.start (state toggle) |
| `etherealCheatDeath` | 1 | `refusal_of_the_river` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | cheatDeath |
| `etherealRegen` | 1 | `endless_torment` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | round.start |
| `debuffOnHitDealt` | 1 | `lingering_regret` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onHitDealt |
| `onAnyDeath` | 1 | `echoes_of_death` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onKill / onDowned (any combatant) -- REVIEW |
| `defenseFloorAtBase` | 1 | `living_fortress` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | stat.def (floor, not a bucket) -- REVIEW |
| `firstMagicalHitPerRoundReduction` | 1 | `arcane_reflection` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | calculateDamage.incoming (per-round one-shot) |
| `periodicSummon` | 1 | `corrupted_grove` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | round.start |
| `counterOnHit` | 1 | `countering_guard` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onHitTaken (reaction attack) |
| `survivedBelowPct` | 3 | `veteran_discipline`, `last_stand` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | fight-lifecycle (threshold watch) -- REVIEW |
| `combatStartSelfBuff` | 3 | `smugglers_caution`, `rapid_reconnaissance` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | fight.start |
| `whileAllyAlive` | 11 | `pack_discipline`, `criminal_command` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | stat.<key> (conditional on party state, recomputed live) -- REVIEW |
| `flatStatBonus` | 10 | `mil_veteran_discipline`, `sang_sec_veteran_watch_discipline` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | stat.<key> |
| `whileAlliesDiverse` | 1 | `combined_arms_authority` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | stat.<key> (conditional on party composition) -- REVIEW |
| `combatStartSummon` | 1 | `prepared_warhound` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | fight.start |
| `counterOnSuccessfulHit` | 2 | `sang_sec_arena_riposte`, `sang_iag_arena_counter` | not individually re-verified -- dispatch lives in combat.js (tickEnemyPassives:4797, applyEnemyOnHitTakenPassives:2261, firstAttackPassiveBonus:3195, among other passive-tick helpers) | applyAndReact.onHitTaken (reaction attack, hit-only) |

---

## 4. Named Items / Kind D

No standalone "named item, no effect id" rules currently exist in the engine (the spec §3 examples "Hadrian's Roll of the Ferratum, Astra Sa'Lahru's Broken Crest" are illustrative placeholders, not real content — `js/data/hadrian.js` only uses those names in backstory prose, not as item/effect ids). The one real gap in this category is **kind D**, per `tools/combat_asymmetry_register.md`: the two existing generic gear effects below already work for the player and a *plain* ally, but are never read on Hadrian's kit-bearing attack path.

| id | name | call site(s) | kind | works for today | proposed hook | proposed bucket | notes |
|---|---|---|---|---|---|---|---|
| `opening_reach` | Opening Reach | `applyOpeningReachForActor(actor, dmg)`, combat.js:1999 (generic over `actor`) | outgoing-mult | player + plain ally; **not Hadrian's kit path** | calculateDamage.outgoing | conditional | Kind D. Checks the attacker's own gear (`hasEffect(actor, "opening_reach")`) — moot today since Hadrian's gear is lore-fixed, not generic `hasEffect`-tagged items, but a real structural gap. Fixed by R1/R2's holder-widening mechanism once Hadrian's kit reads the registry the same way. |
| `executioner` | Executioner | `executionerMultiplierFor(attacker, defenderHp, defenderMaxHp)`, combat.js:1122 (generic over `attacker`) | outgoing-mult | player + plain ally; **not Hadrian's kit path** | calculateDamage.outgoing | conditional | Kind D, same reasoning as Opening Reach. |

---

## 5. Worst-case stack per bucket today

**Outgoing damage** (verified against the spec's own §1/§4 example): Execution Protocol ×2 (burst), Temporal Echo ×2 (burst), Kingslayer ×1.25 (conditional), a crit ×1.5, Momentum at 5 stacks ×1.5 (stacking), Tempered Steel at 15 stacks ×1.3 (stacking), Threads of Consequence ×1.4 (burst) — legacy product **×20.5**, confirmed consistent with current `rollPlayerDamageCoreForPipeline` multiplier chain. Bucketed: conditional (Kingslayer +25% → ×1.25), stacking (Momentum +50% + Tempered Steel +30% = +80%, capped at +75% → ×1.75), burst (Execution Protocol +100% + Temporal Echo +100% + Threads of Consequence +40% = +240%, capped at +150% → ×2.5), crit ×1.5 → **×1.25 × 1.75 × 2.5 × 1.5 = ×8.2**, matching the spec exactly.

**Defense ignore**: `armor_crack` (flat -2, listed in the spec's §4 table) has **no live call site anywhere in engine code** (see §1 above) — it is dead today despite being named in the spec. The two confirmed-live sources are **Foreseen Strike** (×0.5 effective-Defense factor, every 3rd player action, combat.js:1453) and **Commanding Presence** (Regalia of the Crimson Vanguard 4pc; sets the effective-Defense multiplier to **0** outright, same every-3rd-action timing, combat.js:1894 — its own comment notes it already stacks multiplicatively with Foreseen Strike, "which still just zeroes effective Defense either way"). **Precision Formula** (×0.7, magic attacks only, unconditional, combat.js:1523) can combine with either on a magic hit that also lands on a 3rd-action beat: worst case today is **Defense already fully ignored** (0), since Commanding Presence alone zeroes it — the proposed -100% cap (§4) is already the ceiling the current code reaches, so R3's cap introduces no regression risk here.

**Incoming mitigation**: **Spell Ward** and **Storm Barrier** — both named in the spec's own §4 table as current sources — have **no live call site anywhere in engine code** (dead, like `armor_crack`; see §1/§2 above). The two confirmed-live sources don't currently co-occur on one holder: **Stonewarden 6pc** (×0.75, first hit taken each combat, player-only, combat.js:6857) is read via `hasSetTier(state, ...)` (player only today), while **`sangCuDefenderMitigation(creature)`** (combat.js:3908) is read via `hasEffect(creature, ...)` against a Sanguivorum NPC's own worn items (Smuggler's Guard ×0.9 + Commander's Poise ×0.9 → ×0.81 if both are up, each with their own cooldown/once-per-combat gate) — different holder populations today, so the worst-case *single-combatant* stack is either ×0.75 (Stonewarden) or ×0.81 (both Sanguivorum perks), not both multiplied together. Once R1/R2 widen holders, a single combatant could plausibly hold both, giving ×0.75 × 0.81 = ×0.61 (-39%), still under the proposed 60%-reduction cap — worth re-checking once R1/R2 are live, flagged in the report below rather than asserted as final.
