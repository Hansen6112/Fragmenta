# Step 1e coverage table (§3.1)

What this covers: every inline `hasEffect`/`hasSetTier` check, plus the handful
of bare `state.combat` flag gates that work the same way (Siege Corps' charge,
Feint's `nextAttackBonus`, banked Defense, the cooldown-skip flags, Acid's
`corroded` re-cast block), inside the five pipeline functions and five
orchestrators step 1e built or touched:
`rollToHitPlayerActor`/`rollPlayerDamageCoreForPipeline`/
`calculateDamagePlayerActor`/`applyAndReactPlayerActor`, and
`playerAttack`/`useDecoy`/`useAmbush`/`useDisarm`/`useElementAbility`
(all `js/engine/pipeline.js`).

Each row maps the check to the Layer 1 `checkParity` scenario(s) (in
`tools/tests/phase1_step1e_i_player_attack_pipeline_parity.js`,
`..._1e_ii_tactics_...`, `..._1e_iii_elements_...`) whose `effects`/`sets`
array actually stubs that id — not just a scenario whose *name* suggests
it, every mapping below was confirmed against the test file's own setup.
A row with no scenario is marked **not independently tested**, same
convention `tools/combat_asymmetry_register.md` already uses, rather than
silently assumed covered — these checks are still exercised at their
"effect absent" default by every other scenario (parity holds either way,
since the code is a verbatim relocation), just never at their "effect
present" branch by a scenario built for this step.

Out of scope: the generic damage-multiplier helper functions the core
formula calls unconditionally (`dragonslayerMultiplier`,
`bleedExploitationMultiplier`, `kingslayerMultiplier`,
`huntersInstinctMultiplier`, `momentumMultiplier`, `executionProtocolMultiplier`,
`temporalEchoMultiplier`, `foreseenStrikeDefMultiplier`,
`blessingOfValorMultiplier`, `commandingPresenceDefMultiplier`,
`loadedDiceMultiplier`, `avatarOfChaosDamageMultiplier`,
`momentumUnboundMultiplier`, `temperedSteelMultiplier` — the *read*, not the
stack-growth `hasEffect` below), and every shared setup helper the
orchestrators call (`applyEndlessStudy`, `applyWanderersReward`,
`applyActionTypeTracking`, `applyPerfectMemory`, `consumeTrailblazer`,
`applyPerfectTiming`, `applyTacticalMemory`, `applyFirstKingdomCooldown`,
`beginTurn`, `resolveSpeedInitiative`, `resolveKill`,
`resolveRemainingInitiativeActions`, `lowHealthTriggerChecks`,
`applyDodgeBlockNegateBonuses`, `applyLaughingGaleMissBonuses`,
`applyEndlessHorizonEvasionBonuses`, `maybeRiposte`, `tacticsLine`,
`checkReflectDeath`). None of these moved or changed in step 1e — they're
called identically to how `playerAttackLegacy`/the other Legacy functions
always called them — so their own internal gating isn't a new conditional
this step introduced, and auditing it belongs to whichever step actually
migrates them (1f, mostly).

## `rollToHitPlayerActor`

| Check | Gates | Test(s) |
|---|---|---|
| `riposteCounterOnPlayer` on a `basic_attack` miss (internally keyed off the enemy's own `riposte` effect) | Riposte counter-strike on a miss | `P1E-I-MISS-01` |
| Decoy/Ambush/Disarm/every pipelined element's own miss line never calls `riposteCounterOnPlayer` | confirmed absent, not re-stubbed via `hasEffect` (see `P1E-II-D-MISS-01`'s own comment on why) | `P1E-II-D-MISS-01`, `P1E-II-A-MISS-01`, `P1E-II-DI-MISS-01`, `P1E-III-FIRE-MISS-01`, `P1E-III-LIGHTNING-MISS-01` |

## `rollPlayerDamageCoreForPipeline` (shared core — every action routes through this once, Lightning twice)

| Check | Gates | Test(s) |
|---|---|---|
| `hasEffect("tempered_steel")` | Tempered Steel's permanent stack growth | `P1E-I-TEMPEREDSTEEL-01` |
| `hasEffect("soul_leech")` | heals the player for a % of the hit | `P1E-I-SOULLEECH-01` |
| `executionerMultiplier(state)` | finisher bonus vs. a badly-wounded target | `P1E-I-EXECUTIONER-01` |
| `sangCuDefenderMitigation` × `enemyOneHitMitigationMultiplier` × `enemyRepeatableMitigationMultiplier` × `enemyAllyProtectionMultiplier` (combined) | the enemy's own incoming-damage mitigation | `P1E-I-SANGMIT-01` |
| `state.combat.avatarOfCreationTurns > 0` | permanent Atk/Magic stack growth | `P1E-I-AVATARCREATION-PHYS-01`, `-SPELL-01` |
| `creature.passives` (flatDamageReduction / onHitTaken) | Thick Hide reduction / Barbed Hide reflect | `P1E-I-ENEMYPASSIVE-FLATREDUCTION-01`, `-ONHITTAKEN-01` |
| `critMultiplier` via Unlikely Outcome's guaranteed-crit flag | crit damage + flag consumption | `P1E-I-CRIT-01` |
| spell branch: `elementMultiplier`/`avatarOfKnowledgeMatchupOverride` | the target's elemental matchup | `P1E-I-SPELL-ELEMENTMULT-01` |
| isSpell/physical branch split itself — banked Defense peek, Sure Foundation peek, `stat()`-pure atk/def reads | the step 1e §3.2 purity fix | `P1E-I-BANKEDDEF-01`, `-SUREFOUND-01`, `-SUREFOUND-SPELL-01`, `-SIEGECORPS-01`; mirrored by `P1E-II-D/A/DI-BANKEDDEF-01`, `-SIEGECORPS-01`, `P1E-II-D-SUREFOUND-01/-SPELL-01`; `P1E-III-BANKEDDEF-01`, `-SIEGECORPS-01` |
| `hitsTakenFromPlayer` increment | per-hit enemy counter (Reinforced-style triggers) | exercised implicitly by every scenario; its correctness specifically re-verified by the Lightning double-count fix this step found via Layer 2 and locked down with `P1E-III-LIGHTNING-KILL-01` (not a direct Layer 1 assertion on the count itself) |
| `hasEffect("stones_patience")` | Stone's Patience damage mult when the enemy acted first | **not independently tested** |
| `hasEffect("arcane_convergence")` | spell double-roll, keep the higher | **not independently tested** |
| `hasEffect("crushing_impact")` | bonus mult when target's effective Defense exceeds the player's Attack | **not independently tested** |
| `hasEffect("master_craftsman")` | Master Craftsman's own multiplier | **not independently tested** |
| `hasEffect("echoing_arsenal")` | every-5th-physical-attack 2x | **not independently tested** |
| `hasEffect("momentum")` | Momentum's stacking damage bonus growth | **not independently tested** |
| `hasEffect("worthy_challenge")` | Worthy Challenge's stacking bonus growth | **not independently tested** |
| `hasSetTier("Regalia of the Laughing Gale", 2)` | Blessing of Fortune crit-stack growth | **not independently tested** |
| `state.combat.avatarOfWarTurns > 0` | Avatar of War's 10% lifesteal heal | **not independently tested** |
| `state.combat.avatarOfPassingTurns > 0` | Avatar of Passing's 30% heal | **not independently tested** |

## `calculateDamagePlayerActor` (per-action post-processing)

| Check | Gates | Test(s) |
|---|---|---|
| `basic_attack`: `applyOpeningReach` (physical-branch gated) | Opening Reach's 1.15x, first physical attack | `P1E-I-OPENINGREACH-01` |
| `basic_attack`: `borrowedSecondsActive(state)` | Borrowed Seconds' +15% | `P1E-I-BORROWEDSECONDS-01` |
| `basic_attack`: `state.combat.nextAttackBonus` + `hasEffect("patient_aim")` | Feint's 1.6x/1.75x bonus, consumed | `P1E-I-FEINT-01`, `-FEINT-PATIENTAIM-01` |
| `decoy`: `applyOpeningReach` (unconditional — the asymmetry itself) | same 1.15x, no physical-branch gate | `P1E-II-D-OPENINGREACH-01`, `-OPENINGREACH-SPELL-01` |
| `ambush`: `ambushMultiplier(state)` + `hasEffect("ambush_mastery")` | 1.4x→1.55x | `P1E-II-A-AMBUSHMULT-01` |
| `ambush`: `borrowedSecondsActive(state)` | flat +15%, no cooldown refund | `P1E-II-A-BORROWEDSECONDS-01` |
| `disarm`: flat 0.7x then `applyOpeningReach` | unconditional, same asymmetry as Decoy | `P1E-II-DI-OPENINGREACH-01` (0.7x itself exercised by every DI parity scenario) |
| `transportation`: `action.dmgMult * 1.3` | Blink's own extra multiplier | `P1E-III-TRANSPORT-01` |
| `lightning`: `action.dmgMult`, first roll only (second roll moved to step 5) | Flurry's first hit | `P1E-III-LIGHTNING-01`, `-KILL-01`, `-MISS-01` |
| fire/water/acid/force/air: `action.dmgMult` only | synergy/Elemental Focus/Surging Conduit, pre-computed by the orchestrator | one scenario each: `P1E-III-FIRE-01`, `-WATER-01`, `-ACID-01`, `-FORCE-01`, `-AIR-01` |

## `applyAndReactPlayerActor`

| Check | Gates | Test(s) |
|---|---|---|
| `isPhysical` → `consumeSiegeCorpsAtkCharge(state)` | one-shot +2 Attack charge, consumed once | `P1E-I-SIEGECORPS-01`; mirrored by `P1E-II-D/A/DI-SIEGECORPS-01`, `P1E-III-SIEGECORPS-01` |
| Brace/Guarded Strike/Sure Foundation zero-and-regrant (physical-branch gated for Sure Foundation) | banked Defense consumption | `P1E-I-BANKEDDEF-01`, `-SUREFOUND-01`, `-SUREFOUND-SPELL-01`; mirrored across Decoy/Ambush/Disarm/elements per the row above |
| element branch, fire: `state.combat.burn = {...}` | Ignite's DoT | `P1E-III-FIRE-01` |
| element branch, water: heal + `hasSetTier("First Sword's Regalia", 10)` | Torrent's heal / sovereignty refresh | `P1E-III-WATER-01`, `-WATER-SOVEREIGNTY-01` |
| element branch, lightning: second roll gated on `enemySlot.hp > 0` | Flurry's second hit, kill-gated | `P1E-III-LIGHTNING-01` (both land), `-KILL-01` (gate blocks it) |
| element branch, acid: `state.combat.corroded = true`, `enemyDefPenalty += 4` | Corrode's Defense penalty | `P1E-III-ACID-01` |
| element branch, force: `tryApplyEnemyStun` | Concuss's stun | `P1E-III-FORCE-01` |
| element branch, transportation/air: own lines/`evasionTurns` | Blink's line, Windcut's evasion window | `P1E-III-TRANSPORT-01`, `-AIR-01` |
| non-element: kill-check (bare `enemySlot.hp <= 0`), `lastDamageType` via `reportPhysical` | kill resolution + re-targeting | `P1E-I-KILL-01`; `P1E-II-D-KILL-01`, `A-KILL-01`, `DI-KILL-01` |
| `basic_attack`'s gated `applyPhysicalOnHitEffects`/`arenaRiposteCounterOnPlayer` vs. the other three's unconditional version | Hamstring, Arena Riposte | `P1E-I-PHYSONHIT-01`, `-ARENARIPOSTE-01`; `P1E-II-D-PHYSONHIT-01`, `A-PHYSONHIT-01`, `DI-PHYSONHIT-01` |
| `ambush` only: `hasEffect("evasive_release")` on a non-kill hit | Evasive Release's dodge charge | `P1E-II-A-EVASIVERELEASE-01` |
| `playerAttack`'s own tail: `isPhysicalHit && hasEffect("guarded_strike")` | guardBonus threaded into the round's remaining initiative | `P1E-I-GUARDEDSTRIKE-01` |

## Orchestrator-level inline checks (cooldown/gating logic carried over verbatim from each Legacy body)

| Function | Check | Gates | Test(s) |
|---|---|---|---|
| `useDecoy` | `hasEffect("perfect_recall")` | bypasses the cooldown-not-ready block | **not independently tested** |
| `useDecoy` | `hasSetTier("First Kingdom", 6)` / `hasEffect("master_strategist")` | reduces the base cooldown | **not independently tested** |
| `useDisarm` | `hasEffect("perfect_recall")` | same bypass | **not independently tested** |
| `useDisarm` | `hasSetTier("First Kingdom", 6)` / `hasEffect("master_strategist")` | same reduction | **not independently tested** |
| `useDisarm` | `hasEffect("guarded_strike")` (unconditional, own tail — not gated on the follow-up landing) | guardBonus into the round's initiative | `P1E-II-DI-GUARDEDSTRIKE-01` |
| `useElementAbility` | `elementKey === "acid" && state.combat.corroded` (bare flag) | blocks re-casting Corrode on an already-corroded target | `P1E-III-ACID-ALREADYCORRODED-01` |
| `useElementAbility` | `hasEffect("elemental_focus")`, Earth branch (`defBonus` boost) | `P1E-III-EARTH-FOCUS-01` | |
| `useElementAbility` | `hasEffect("elemental_focus")`, non-Earth branch (`focusMult` on `elementalDmgMult`) | **not independently tested** (only the Earth branch has a scenario) |
| `useElementAbility` | `hasEffect("spell_echo")` | second half-power casting, kill-gated | `P1E-III-SPELLECHO-01`, `-SPELLECHO-KILL-01` |
| `useElementAbility` | `hasEffect("world_walker")` | activation-restriction bypass for Transportation | **not independently tested** |
| `useElementAbility` | `hasEffect("seedbearer")` | every-3rd-cast heal | **not independently tested** |
| `useElementAbility` | `hasEffect("conduit_mastery")` | -1 cooldown | **not independently tested** |
| `useElementAbility` | `hasSetTier("Novitiate", 6)` / `hasEffect("rivers_favor")` | free first cast | **not independently tested** |
| `useElementAbility` | `hasEffect("conduit_ease")` | chance to shave the cooldown | **not independently tested** |
| `useElementAbility` | `hasEffect("eureka")` | every-4th-cast free cooldown | **not independently tested** |
| `useElementAbility` | `hasSetTier("Regalia of the Endless Archive", 4)` | Universal Understanding, shaves another known element's cooldown | **not independently tested** |
| `useElementAbility` | `hasEffect("twin_rivers")` | synergy damage ×1.4 when an element was just used | **not independently tested** |
| `useElementAbility` | `hasEffect("surging_conduit")` | per-fight charge gate on the surge multiplier | **not independently tested** |
| `useElementAbility` | `hasEffect("brace") && hasSetTier("Siege Corps", 6)`, Earth branch | grants the Siege Corps charge after Stoneskin | **not independently tested** |
| `useElementAbility` | `hasEffect("brace")`, Earth branch | `braceBonus` fed into the round's remaining initiative | **not independently tested** |

## Summary

Of the checks tabulated above: 10 bare state-flag/orchestrator-identity
checks (Siege Corps, Feint, banked Defense, kill resolution, cooldown
reduction flags, Corrode's self-block) and 17 named `hasEffect`/`hasSetTier`
checks have a scenario that actually activates them. 18 named
`hasEffect`/`hasSetTier` checks — mostly Divine Regalia/Legendary/Mythic
stacking buffs and element-cooldown-economy gear inside the shared core
formula and `useElementAbility`'s own cooldown chain — have none. All of
these untested checks are **unmoved code**: `rollPlayerDamageCoreForPipeline`
is `rollPlayerDamage`'s own body relocated verbatim, and `useElementAbility`'s
cooldown chain is `useElementAbilityLegacy`'s own, so a regression specific
to step 1e's restructure is unlikely to hide in them — but they were never
exercised by a dedicated scenario before this step either (no earlier step's
test suite touches the player's own outgoing-attack gear), so this is a
pre-existing coverage gap step 1e didn't introduce and didn't close, not a
new risk. Flagged here rather than left unstated.
