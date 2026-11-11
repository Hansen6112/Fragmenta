# Step 1f coverage table

What this covers: every reaction, tick, and enemy-ability-as-data shape
step 1f (1f-i through 1f-iv) built or touched — each row maps a
declared field or trigger name to the test scenario(s) that actually
exercise it, same convention `combat_1e_coverage.md` already uses. A
row with no scenario is marked **not independently tested** rather than
silently assumed covered.

Out of scope: Dregnar (step 1g); `resolveKill` itself; healing outside
combat; deleting the old per-pair paths/`PER_ENEMY_FIELDS` proxy (step
1h).

## 1f-i: Hadrian's kit as data, field ledger

| Check | Gates | Test(s) |
|---|---|---|
| Hadrian's kit (`js/data/hadrian.js`'s `action` block: `formula`, `hooks`) read generically by `calculateDamageAllyActor`/`applyAndReactAllyActor`, no `action.kit`/`defId === "hadrian"` branch | Hadrian's own basic swing, actives, retaliation | `test_ally_proof_ledger.js` (new test-only ally action, data-only, zero step-function changes — the Hadrian-equivalent of `test_strike_proof_ledger.js`); pre-existing `phase1_step1d_ally_attack_pipeline_parity.js`/`ally_protection_ledger.js` scenarios unaffected (confirmed by full-suite parity, not re-written) |
| `tools/audit.js` P4 extended for ally identity (`action.kit`'s own truthiness, `defId`/`id === "hadrian"/"kessa"`, a named-ally helper called outside `PIPELINE_HOOKS`) | zero per-ally identity branches remain in `pipeline.js`/`actions.js` | enforced mechanically on every `audit.js` run, same as P4's original 1e-completion scope |
| `tools/combat_field_ledger.js`: "storage not yet moved" counts only `wirePlayerFieldsProxy`-wired fields (117/148) vs. "old-name references remaining" (148/148, unchanged — no renames in 1f) | the two numbers the handoff's §3 asked to split apart | `node tools/combat_field_ledger.js`'s own output, re-verified after the fix commit (88d3078) that corrected an initial 101/148 miscount |

## 1f-ii: enemy active abilities + summons onto definitions

| Check | Gates | Test(s) |
|---|---|---|
| `ENEMY_ACTIVE_ACTION_SHAPE` (`targeting`/`toHit`/`actionType`/`formula`) merged onto every `ENEMY_ABILITIES` active entry by `getEnemyAbility()`, read generically by `calculateDamage`'s enemy branch (now `PIPELINE_FORMULAS.enemyCore`) | ~150 active enemy abilities, zero per-ability math change (verbatim extraction) | `dregnar_stage_a_ledger.js`/`-b_ledger.js` (30+36), full boss sweep + plus3 bit-for-bit vs. the 1f-i baseline — no dedicated new test file; this step's own math is a pure relocation, so the existing battery is the right regression signal, not a new scenario |
| `ENEMY_BASIC_ATTACK_DEF` ("no active ability chosen" case gets the same definition treatment `basic_attack` already has) | every enemy's plain swing | same battery |
| `resolveEnemyAttackOnPlayer`/`OnAlly`'s `formula: (abilityCtx && abilityCtx.formula) \|\| ENEMY_BASIC_ATTACK_DEF.formula` (tolerant fallback, not a strict read) | `checkCounteringGuard`'s own synthetic abilityCtx (no `.formula` field) doesn't crash | caught by a deliberate strict-read regression during this step (22 tests crashed), fixed, re-verified — see this step's own commit |
| `tools/audit.js` P4 extended: `resolveEnemyActiveAbility`/`resolveEnemySummon`/`buildSummonedEnemyRecord`'s own bodies only (not all of `combat.js`, to avoid false-positiving on Dregnar's own `abilityId === "dra_barrier"`, explicitly out of scope until 1g) | zero `abilityId ===`/`ability.id ===`/`switch(abilityId)` in those three functions | enforced mechanically; deliberate break-and-revert tested during this step |

## 1f-iii: reactions as definitions

Every reaction below runs through `chooseAction → chooseTargets →
rollToHit → calculateDamage → applyAndReact` (steps 2-5), target fixed
to whichever combatant the reaction answers. `action.isReaction` is the
one new flag threading all of them together — it gates `calculateDamage`'s
Mirror Soul check, `chooseAction`'s Reinforced-counter increment, and
dispatches `applyAndReact` to a dedicated tail instead of the heavier
normal-attack body for that actor/target kind.

| Reaction | Direction | Formula | Tail | Test(s) |
|---|---|---|---|---|
| Last Bastion retaliation | ally wearer → enemy | `allyRetaliate` | `applyAndReactAllyActor` (reused — no leak: its extra features are all opt-in via declared fields a reaction doesn't set) | `P1F3-RETALIATE-OFF-01`, `-HIT-01`, `-KILL-01` (`phase1_step1d_ally_attack_pipeline_parity.js`) |
| Riposte, ally wearer → enemy | ally wearer → enemy | `riposteCounterAlly` | `applyAndReactAllyActor` (reused) | `P1F3-RIPOSTE-ALLY-ONENEMY-01`, `-KILL-01` (`phase1_step1c_ally_pipeline_parity.js`) |
| Riposte, enemy wearer → player | enemy wearer → player | `riposteCounterEnemy` | `applyAndReactReactionOnPlayer` (dedicated — `applyAndReactPlayerActor`'s body carries Guarded Strike/Serrated Opening/Marked Target/Duelist's Measure/Mercy of the Veil, none of which a riposte ever had) | `P1E-I-MISS-01` (pre-existing, `phase1_step1e_i_player_attack_pipeline_parity.js`) |
| Arena Riposte, enemy wearer → player | enemy wearer → player | `arenaRiposteEnemy` (declared `mult`, default 0.8x) | `applyAndReactReactionOnPlayer` | `P1E-I-ARENARIPOSTE-01` (pre-existing) |
| Riposte, enemy wearer → ally | enemy wearer → ally | `riposteCounterEnemyOnAlly` | `applyAndReactReactionOnAlly` (dedicated — the ordinary ally-target body carries ally-protection interceptions/Companion mitigation/Last Bastion chaining, none of which a riposte ever had) | `P1D-K-MISS-01` (non-lethal, pre-existing), `P1F3-RIPOSTE-ENEMY-ONALLY-KILL-01` (new, `phase1_step1d_ally_attack_pipeline_parity.js`) |
| The PLAYER's own Riposte (`maybeRiposte`) → enemy | player wearer → enemy | `riposteCounterPlayer` | `applyAndReactReactionOnEnemy` (dedicated — `applyAndReactPlayerActor`'s unconditional Siege Corps atk-charge consumption has no opt-out) | `P1F-MAYBERIPOSTE-*` (8 scenarios, `phase1_step1f_iii_player_riposte_pipeline_parity.js`) |
| Interceptions (Legion's Memory, Brothers in Arms, generic Ally Protection Reaction) | enemy → ally, before HP changes | n/a (named `onIncomingDamage` hooks, `ON_INCOMING_DAMAGE_ALLY_HOOKS`) | inside `applyAndReactAllyActor`'s/the ally-target body's own call, step 5 | `ally_protection_ledger.js` (pre-existing, real-kit coverage) |
| Mirror Soul's reflection | triggering creature → itself | n/a (computed inline in `calculateDamage`, tagged `kind: "mirrorSoul"`) | `applyAndReactMirrorSoul` | `P1-MIRRORSOUL-01/02/03` (pre-existing, `phase1_step1b_pipeline_parity.js`) |
| Spell Echo (found via P1 scoping) | player → enemy, no roll | `spellEchoReaction` | `applyAndReactReactionOnEnemy` with `deferKillCheck: true` (the one shape where the ORCHESTRATOR, not the tail, resolves the kill — see `useElementAbility`'s own unconditional check) | `P1E-III-SPELLECHO-01/-KILL-01` (pre-existing) + `-ECHOKILL-01` (new, this step — the echo-itself-is-the-kill case) |
| Low-health triggers (player side) | self | n/a (`LOW_HEALTH_REACTIONS` table, 16 entries, generic dispatch loop) | n/a (each entry's own existing function, untouched) | every pre-existing scenario for Hold the Line/Rooted Resolve/the 14 Avatar-of-* effects, unaffected (pure dispatch-shape change, zero behavior change) |
| Low-health triggers (enemy side) | self | n/a (already dispatched generically by `trigger === "survivedBelowPct"`) | n/a | unchanged, disclosed as already-compliant rather than modified |
| On-hit-taken triggers (enemy side) | self (reflect/inflict-status back onto attacker) | n/a (already dispatched generically by `trigger === "onHitTaken"`) | n/a | unchanged, disclosed as already-compliant rather than modified |
| Throwaway test reaction (handoff's own required proof) | enemy → player | `testHalfCounter` (registered at runtime, never written to disk) | `applyAndReactReactionOnPlayer` (reused, unmodified) | `test_reaction_proof_ledger.js`, 6 scenarios — including two confirming "reactions don't chain" (Mirror Soul, Reinforced) for a BRAND NEW reaction with zero new guards |

## 1f-iv: DOT ticks through steps 4-5

Each tick runs `calculateDamage → applyAndReact` only (no
`chooseAction`/`chooseTargets`/`rollToHit` — a tick is never chosen and
never rolls to hit). Actor and target are the SAME combatant
(self-contained), a shape neither function's existing kind-combo
dispatch supported before this step — both gained one top-of-function
`action.isTick` guard.

| Tick | Formula | Tail | Final-number adjustment | Test(s) |
|---|---|---|---|---|
| Enemy burn | `tickBurnEnemy` | `applyAndReactTickOnEnemy` | Ashward 0.75x (`dra_e08_ashward`) | `P1F4-BURN-01`, `-EXPIRE-01`, `-ASHWARD-01` |
| Enemy bleed | `tickBleedEnemy` | `applyAndReactTickOnEnemy` | none | `P1F4-BLEED-01` |
| Player status DOT | `tickStatusPlayer` | `applyAndReactTickOnPlayer` | Heatproof halves `burning` specifically | `P1F4-PLAYER-DOT-01`, `-HEATPROOF-01`, `-DEFEAT-01`, `-RESCUE-BREAK-01` |
| Ally status DOT | `tickStatusAlly` | `applyAndReactTickOnAlly` | ally-kit vulnerability multiplier (read generically off `ALLY_DEFS`, not special-cased) | `P1F4-ALLY-DOT-01`, `-VULN-01`, `-ARENAFLOOR-01`, `-KILL-01` |
| Control-flow nuances | n/a | n/a | burn's own `continue` after a kill (bleed has none); a DOT kill on a non-active enemy redirects `combat.activeIndex` back afterward | `P1F4-BURN-CONTINUE-01`, `-BLEED-NO-CONTINUE-01`, `-DOT-KILL-REDIRECT-01` |

All 15 scenarios: `phase1_step1f_iv_ticks_pipeline_parity.js`.

## Audit rules as coverage (step 1f §6)

Same point `combat_1e_coverage.md`'s own addendum makes for P2/P4: these
are a form of coverage the tables above don't capture, since they catch
a REGRESSION mechanically rather than requiring a human to notice it.

- **P1** (new, this step): every combat HP decrease (`-=`) in
  `combat.js`/`pipeline.js`/`companion.js` must live inside
  `applyAndReact`'s own call graph (its dispatch, every tail, and the
  shared primitives those tails call into). Scoping this rule — reading
  every current HP-write site and classifying it — is what surfaced
  `maybeRiposte` and Spell Echo as real, undisclosed gaps, both fixed in
  this step's own commits. 0 hits; deliberately exempts Dregnar
  (currently 0 matches — his damage already reaches the shared
  `resolveEnemyAttackOnPlayer`/`OnAlly` entry points migrated in 1b/1c),
  every `*Legacy`-named function (confirmed zero live callers),
  creature-construction code, one confirmed-dead function
  (`resolveEnemyRetaliation`, a step 1h deletion candidate), and
  Groundbreaker's splash (a pre-existing, already-disclosed design
  choice, not a migration gap).
- **P4** (extended twice this step): the ally-identity extension (1f-i)
  and the enemy-active-ability extension (1f-ii), both described above.

## Summary

1f-iii's reaction family (9 distinct reactions, 2 generic-dispatch
enemy triggers already compliant before this step, 1 required
throwaway proof) and 1f-iv's 4 DOT ticks are each covered by at least
one dedicated Layer 1 scenario; every migration in this step also holds
exact bit-for-bit parity on both whole-fight harnesses
(`boss_sweep.js`/`plus3_run.js`) against the previous step's own
baseline, checked after every single commit. No check in this step's
own scope is left at **not independently tested** — unlike 1e's own
table, which flagged 18 pre-existing gear checks it didn't introduce
and didn't close, 1f's new surface is small enough (reactions/ticks,
not the full outgoing-attack gear economy) that every declared field
this step itself added has a scenario exercising it.
