# Step 1h coverage table

What this covers: every path step 1h (1h-i through 1h-v) built,
deleted, or touched — freezing the Legacy-oracle fixtures, deleting the
15 superseded/dead per-pair functions, replacing both aliasing proxies
(`PLAYER_FIELDS`/`wirePlayerFieldsProxy`, `PER_ENEMY_FIELDS`/
`wireActiveEnemyProxy`) with explicit storage reached by an explicit
accessor, turning on audit rule P3, and regenerating the field ledger —
each row maps a declared field, path, or check to the test scenario(s)
that actually exercise it, same convention `combat_1e_coverage.md`/
`combat_1f_coverage.md`/`combat_1g_coverage.md` already use. A row with
no scenario is marked **not independently tested** rather than
silently assumed covered.

Out of scope: Appendix A (the Groundbreaker accuracy-restore bug, task
#114), deliberately deferred until after this step completes.

## 1h-i: freeze the Legacy-oracle fixtures

| Check | Gates | Test(s) |
|---|---|---|
| Six Layer 1 parity harnesses' (1b/1c/1d/1e-i/1e-ii/1e-iii) Legacy-function oracle output frozen into on-disk JSON fixtures (`FIXTURE_PATH`), captured once while the Legacy functions still existed, read back (`frozenIn[code]`) from every later run | every one of the six harnesses still produces the same comparison after the freeze as it did calling the live Legacy function directly | re-run immediately after freezing and confirmed byte-identical to the pre-freeze run, before anything was deleted |

## 1h-ii: delete the 15 superseded/dead functions

| Check | Gates | Test(s) |
|---|---|---|
| 12 functions deleted from `combat.js`, 3 from `companion.js` (`resolveEnemyAttackOnAllyLegacy`, `allyAggressiveActionLegacy`, `resolveEnemyRetaliation`, `riposteCounterOnPlayerLegacy`, `arenaRiposteCounterOnPlayerLegacy`, `riposteCounterByEnemyOnAllyLegacy`, `riposteCounterByAllyOnEnemyLegacy`, `playerAttackLegacy`, `useDecoyLegacy`, `useAmbushLegacy`, `useDisarmLegacy`, `useElementAbilityLegacy`, `basicCompanionAttackLegacy`, `useHadrianActiveLegacy`, `maybeCompanionRetaliateLegacy`) — each boundary re-derived via an exact brace-matching scan, not a "next function starts here" guess | nothing left calls any of the 15 names for real; every remaining textual hit is a comment, rewritten to name the live replacement instead | orphan sweep: each of the 15 names grepped individually across `js/`, `main.js`, `parser.js`, `tools/` |
| Real bug found and fixed: 4 style-B parity files (1d, 1e-i, 1e-ii, 1e-iii) passed their `*Legacy` function as a bare identifier ARGUMENT to `checkParity()` — JS evaluates call arguments eagerly, so deleting the functions would throw `ReferenceError` at every one of ~113 call sites, despite `checkParity`'s own internal use of that argument being lazy | `legacyFn` parameter dropped entirely from `checkParity` in all 4 files; `oldRun` now always reads `frozenIn[code]` unconditionally | full suite still 445/445 after the fix, confirming no call site was missed |
| 3 non-`checkParity` scenarios in 1e-ii (`P1E-II-D-LOWHEALTH-FIX-01`, `-A-LOWHEALTH-FIX-01`, `-A-DODGEBLOCK-FIX-01`) called `useDecoyLegacy`/`useAmbushLegacy` directly as their own oracle | replaced with the already-verified hardcoded fact (`oldFired: false`) those same scenarios established while the live oracle still existed | re-run after the fix, same 3 scenarios still pass |
| `tools/audit.js` P1: `/Legacy$/` pattern and `"resolveEnemyRetaliation"` removed from the allow-list | 0 hits before AND after removal (confirms neither exemption was hiding a real violation) | `audit.js`'s own P1 count, re-verified immediately after removal |

## 1h-iii: `PLAYER_FIELDS` → explicit `state.combat.player` store

130 fields (not the handoff's own "~101" estimate — re-derived by
reading the live array, the authority per the handoff's own "check
before moving" instruction). Moved in 8 commits (`c8004de` through
`af4a7b5`): the explicit store built first (`makePlayerCombatStore`),
then every call site rewritten in batches (`combat.js` in 4 line-range
batches, then `pipeline.js`, `companion.js`/`resolver.js`/`actions.js`/
`tactics.js`, `synergy.js`, `tools/tests/`), with the old alias
(`wirePlayerFieldsProxy`) kept wired and synchronized throughout so
both spellings read/wrote identical storage until every caller was
confirmed migrated — only then deleted, in the final commit.

| Check | Gates | Test(s) |
|---|---|---|
| `makePlayerCombatStore(combat)` deletes each flat `combat[field]` after copying its value into the new store — not just adding the store alongside the old data | `state.combat.player.<field>` holds the right value AND `combat.<field>` itself is a genuine own-property miss, not a stale leftover (the exact risk the handoff flagged for this step) | `P1G-III/IV/V/VI-ACCESSOR-01` (one per field-move batch, `phase1_step1g_iii/iv/v/vi_field_move_batch*_ledger.js`), rewritten this step to check `Object.getOwnPropertyDescriptor` on both objects directly |
| Two production bracket-notation gaps the literal-name rewrite couldn't catch (`combat.js:2049`, `pipeline.js:1657`, both the same Avatar of Chaos mechanic, `state.combat[field]` with a dynamically-computed field name) | found via a broader grep for `.combat[` against a variable, across the whole repo | full suite re-run clean after both fixes; `audit.js` P1 unaffected |
| 5 field-name collisions (`adaptiveWardElement`, `stormBarrierUsed`, `firstHitTakenUsed`, `tacticalMemoryUsed`, `firstPhysicalAttackDone`) also exist as per-ally/per-enemy fields under the identical name on a DIFFERENT object (task #29's wearer-neutral equipment work) | none of the 5 were touched by the `PLAYER_FIELDS` rewrite anywhere | grep confirmed all 5 remaining occurrences are on `ally.<field>`/`enemy.<field>`/`actor.<field>`, never `combat.<field>` |
| `injury_ledger.js`'s INJ-10/INJ-11: hand-rolled `s.combat = {...}` fixtures bypass `startCombat`, so never got a `.player` sub-object | `resolvePlayerDefeatOrDowned`'s wipe-causing-hit branch, the only one of 12 similar hand-rolled fixtures that actually reads `.player.playerLastHitType` | fixed by adding the nested `player: {...}` alongside the flat field; re-run confirmed the exact 22/24 pass count this file always expects |
| Six Layer 1 parity harnesses' `snapshot()` reconstructs the pre-1h-iii flat shape (merging `.player` back up, dropping the key) for DATA equivalence against the permanently-frozen 1h-i fixtures, plus stable/sorted-key serialization for ORDER equivalence (property insertion order can never match the frozen fixtures again either) | all six harnesses' own `PARITY`-tagged scenarios | `phase1_step1b/c/d/e_i/e_ii/e_iii_pipeline_parity.js`, all passing at their usual counts |
| `tools/audit.js` P1/P4: unaffected by this step (no HP-write or action-identity logic changed, only where player state physically lives) | 0 hits throughout | re-verified after every commit in this step |

## 1h-iv: `PER_ENEMY_FIELDS` → explicit `activeEnemySlot(combat)` access

26 fields (the array's own literal count — the handoff/earlier
mid-session notes said 24, an undercount corrected by reading the
source directly rather than trusting the earlier estimate). Unlike
`PLAYER_FIELDS`, the real data already lived at `enemies[i]` before
this step — `wireActiveEnemyProxy` was a pure passthrough, so no
"build the store first, keep the proxy synced" commit was needed; call
sites were rewritten directly with the proxy still active throughout
(4 commits, `5cadf8f` through `d12c186`), then the proxy itself deleted
in a final commit (`99c903a`).

| Check | Gates | Test(s) |
|---|---|---|
| Every production occurrence (`combat.js`, `pipeline.js`, `resolver.js`, `companion.js` (0 — its matches are comment-only), `data/actions.js`, `data/synergy.js`) rewritten per-occurrence to `activeEnemySlot(combat).<field>`, never caching the returned slot across a span that could itself move `activeIndex` (e.g. `resolveKill` advancing to a survivor) — provably equivalent to the deleted proxy's own get/set at any call depth, since both re-derive `activeIndex` fresh on every access | every single rewritten occurrence reviewed by hand against this exact caching risk, not spot-checked | full suite 445/445 after each batch; `resolveKill`/`applyArchiveEternal` specifically verified line-by-line against the `activeIndex` reassignment point |
| Real bug found and reverted: the mechanical rewrite script's regex anchored on only the two literal prefixes `state.combat`/`combat`, so a longer chain (`h.state.combat.<field>`, `data/actions.js`'s `PIPELINE_HOOKS`) matched starting mid-chain and silently dropped the `h.` prefix (`h.activeEnemySlot(state.combat).burn` — passes `node -c`, throws at runtime) | script's regex changed to capture the full dotted chain ending in `.combat` and reuse it verbatim; the broken first attempt on `companion.js`/`resolver.js`/`actions.js`/`synergy.js` was fully reverted before re-running correctly | `git diff` reviewed line-by-line on the corrected re-run of all 4 files; `data/actions.js`'s `h.state.combat.burn`/`.corroded`/`.enemyDefPenalty` lines confirmed now read `activeEnemySlot(h.state.combat).<field>` |
| Second bug found and fixed by hand: the same script's object-literal-key guard (`hp: 5`) also wrongly suppressed a ternary's `? combat.hp : 0` shape, leaving one stale read in `tools/tests/downed_ledger.js` (`s.combat ? s.combat.hp : 0`) | confirmed the ONLY occurrence of this pattern anywhere in the repo via a dedicated grep after the main rewrite | fixed by hand; full suite re-run clean |
| 13 `tools/tests/*.js` files rewritten the same way as production (`ally_protection_ledger`, `d1_stun_fix_ledger`, `downed_ledger`, `dregnar_stage_a/b_ledger`, `phase1_step1a_combatant_ledger`, `phase1_step1b/c_*_pipeline_parity`, `phase1_step1e_iii_elements_pipeline_parity`, `phase1_step1g_i/ii/vii_*_parity/ledger`, `test_reaction_proof_ledger`) | every rewritten occurrence reviewed for the same caching risk; none found (all single-statement reads/writes, no nested activeIndex-mutating calls between accesses) | full suite 445/445 |
| Deleting `wireActiveEnemyProxy` changes `JSON.stringify(state.combat)`'s shape again, same as deleting `wirePlayerFieldsProxy` did in 1h-iii (the 26 fields stop being enumerable top-level keys) | the same six Layer 1 parity harnesses' `snapshot()` extended to ALSO copy the active enemy's own `PER_ENEMY_FIELDS` values back onto the flattened copy, by name (not a wholesale object merge — the enemy record carries other fields, e.g. `alive`, that were never part of the old flat alias) | `phase1_step1b/c/d/e_i/e_ii/e_iii_pipeline_parity.js`, confirmed failing before the fix (exactly these 6 files' `PARITY`-tagged scenarios) and passing after |
| Stray `reinforcedAttackCount: 0` literal baked directly into `state.combat`'s own object literal in `startCombat` — harmless only because `wireActiveEnemyProxy` silently replaced it via `Object.defineProperty` on the same tick; once the proxy was gone, this would have made `state.combat.reinforcedAttackCount` quietly return `0` instead of genuinely being `undefined` — the "stale value, not a clean break" risk the handoff explicitly flagged for this step | checked all 26 field names against the literal, found only this one; removed | direct in-page proof check (new `GameState`, `startCombat`, `Object.prototype.hasOwnProperty.call(s.combat, field)` for all 26 names → all `false`), plus `activeEnemySlot(s.combat).hp` resolving correctly to the live per-enemy value |

## 1h-v: audit rule P3, field ledger at 0, this doc

| Check | Gates | Test(s) |
|---|---|---|
| `tools/audit.js` P3 (new): no `*Legacy`/`resolveEnemyRetaliation` function declaration, no `Object.defineProperty` targeting a `combat` chain, no `combat.<field>`/`state.combat.<field>` spelling for a `PLAYER_FIELDS`/`PER_ENEMY_FIELDS` name — scoped to `combat.js`/`pipeline.js`/`companion.js`/`resolver.js` (per the handoff) plus `data/actions.js`/`data/synergy.js` (added: this step's own full-repo sweep found the exact same regression pattern there, so leaving them unguarded would leave the one place it was actually seen unprotected) | 0 hits on live code; a deliberately reintroduced `fooLegacy() { return state.combat.hp; }` correctly trips BOTH the function-name and alias-spelling checks, then reverted clean | `node tools/audit.js`, plus a deliberate break-and-revert |
| `tools/combat_field_ledger.js` regenerated: two bugs in its own text-scan fixed first — it never stripped comments (so a left-behind EXPLANATORY comment mentioning the old spelling, kept on purpose as history, kept 6 fields reading "touched" forever even with zero real callers left), and its bare `combat\.(\w+)` pattern wrongly captured `player` itself out of `combat.player.<realField>` chains (and a naive `(?!\.)` fix for that truncated matches instead of rejecting them — `cooldowns`→`cooldown`, `player`→`playe` — caught by actually running it, fixed with a `\b` added before the lookahead) | ledger reports **0 fields left to move** (0 tracked, 16 structural, correctly excluded) | `node tools/combat_field_ledger.js`; sanity-checked by deliberately reintroducing a stale `ctx.state.combat.hp` reference into `chooseAction` (correctly reported as 1 tracked field), then reverting |

## Audit rules as coverage

Same point `combat_1e/1f/1g_coverage.md`'s own addenda make for P2/P4:
these catch a regression mechanically rather than requiring a human to
notice it.

- **P1**: unchanged this step — no HP-write logic moved, only where
  player/enemy state physically lives. 0 hits throughout.
- **P3** (new this step): guards against either deleted proxy, or any
  of the 15 deleted functions, being reintroduced. 0 hits; verified to
  actually catch a regression, not just trivially pass (see 1h-v table
  above).
- **P4**: unchanged this step — no new per-ability/per-ally identity
  branches introduced anywhere in 1h's own work.

## Summary

Step 1h's own gate, stated in the handoff: delete the old paths with
zero behavior change, verified at every increment. All five sub-steps
land: the Legacy-oracle fixtures are frozen and permanent; the 15
dead/superseded functions are gone, with the one real eager-evaluation
bug this exposed found and fixed before it could break anything;
`PLAYER_FIELDS` (130 fields) and `PER_ENEMY_FIELDS` (26 fields) both
moved off their respective proxies onto explicit storage reached by an
explicit accessor (`state.combat.player.<field>` /
`activeEnemySlot(combat).<field>`), each proxy deleted only after a
full-repo sweep confirmed zero remaining readers of the old spelling;
P3 is on and verified to actually catch a regression; the field ledger
reads **0 fields left to move** for the first time this Phase. The
full suite (445 scenarios) and `tools/audit.js` (0 errors) were run
after every commit in this step, and `boss_sweep.js`/`plus3_run.js`
stayed bit-for-bit identical to the pre-1h baseline (`19389ab`) across
the entire step. No check in this step's own scope is left at **not
independently tested**.
