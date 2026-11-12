# Regression suite

```
node tools/tests/run_all.js
```

Starts a local static server over the repo, runs every ledger in this
directory against the real engine via Playwright, and prints:

```
suite: X/X
audit: N error(s), ... warnings
```

`suite: X/X` is the number every Combat Rebuild Phase 1 step's report
quotes. `audit` is `tools/audit.js`'s own error count, run as a second,
separate check — it isn't folded into the suite total since it isn't a
pass/fail ledger, but 0 errors is the expected state. `tools/combatsim.js`
(a balance report with no fixed "correct" answer) isn't part of this
runner at all — run it by hand when a change could plausibly shift
balance.

## Seeding, and reproducing an intermittent failure

Phase 1 close-out handoff §2: every ledger seeds the real page's
`Math.random()` (via `seed_rng.js`'s `seedPageRandom`, installed through
`page.addInitScript` before `index.html`'s own `<script>` tags run) with
a fresh value each run, and always prints it as its own first line:

```
seed: 2546747721
```

This covers BOTH a scenario's own unforced setup randomness and
whatever the real engine rolls internally that a scenario doesn't
explicitly force — before this, a scenario that forgot to force every
roll it depended on (the exact bug found and fixed here, `injury_ledger.js`'s
own `INJ-15`: an unforced ally attack that could occasionally land a
kill, ending the fight a different way than the scenario meant to
isolate) could fail roughly once every several runs with no way to
replay the exact sequence that caused it.

**To reproduce a specific failure:** take the `seed:` value `run_all.js`
printed next to that ledger's own failure block (it now prints both the
seed line and every failing case's own `detail:` line — previously it
only matched lines containing the literal text "FAIL", which silently
dropped the detail a human actually needs), then re-run just that one
file directly with the same seed:

```
TEST_SEED=2546747721 node tools/tests/<the-failing-file>.js
```

This reproduces the exact same sequence of random draws byte-for-byte —
confirmed by running the same `TEST_SEED` twice and diffing the output.
Omit `TEST_SEED` for an ordinary run (a fresh seed every time, which is
what actually exercises different random paths across repeated runs and
is how `INJ-15`'s own bug was originally caught — looping the suite
until it failed, then reproducing that one run's logged seed directly).

A scenario's own explicit `const orig = Math.random; Math.random = () =>
0.02; ...; Math.random = orig;` pattern (used throughout this suite to
force a hit/miss/crit/chance roll) is unaffected either way — `orig`
just captures the seeded function instead of the unseeded native one,
and restores it the same way.

## What each ledger covers

| File | Covers |
|---|---|
| `injury_ledger.js` | Injury System v0.2/v0.3: assignment rules, the 7th-fall death rule, field treatment, save round-trips |
| `downed_ledger.js` | The "downed, not dead" defeat rule: transitions, targeting exclusion, round continuation, revival, final defeat, gear cheat-death priority |
| `ally_protection_ledger.js` | The generalized ally-protection reaction mechanic |
| `dregnar_stage_a_ledger.js` | Dregnar Ashvein's Stage A stats/state machine/passives/actives |
| `dregnar_stage_b_ledger.js` | Dregnar Ashvein's Stage B Mythic kit (10 items, 10 item effects, exclusive set tiers) |
| `party_cap_ledger.js` | `MAX_PARTY_ALLIES = 3` enforcement across every recruitment path |
| `consumable_noop_ledger.js` | Consumables aren't consumed when their effect would do nothing |
| `injury_items_ledger.js` | Smelling salts / field splint kit craftability, shop reachability, field-treatment gating |
| `phase1_step1a_combatant_ledger.js` | Combat Rebuild Phase 1 step 1a: combatant views, `stat()` accessor parity |
| `phase1_step1b_pipeline_parity.js` | Combat Rebuild Phase 1 step 1b: the five-step pipeline vs. the pre-migration enemy-to-player path, forced-roll unit parity, and the "effect changed something" control check |
| `phase1_step1c_ally_pipeline_parity.js` | Combat Rebuild Phase 1 step 1c: the pipeline extended to the enemy-to-ally path, including the player/ally asymmetries it preserves on purpose (Reinforced, Marked Target, Riposte-on-miss, ...) |
| `d1_stun_fix_ledger.js` | Listed change D1 (9 Nov): a stunned enemy skips its whole action regardless of target/ability/summon, checked per action slot (including Flurry); Dregnar's own bespoke stun handling is unaffected |
| `combat_unify_switches_ledger.js` | Handoff §2 (9 Nov) + step 1e §0 follow-up: COMBAT_UNIFY switches (U1/U2/U3a-g) in pipeline.js -- each one, forced on, changes something on a built-to-trigger scenario; off (the default) is covered by phase1_step1c_ally_pipeline_parity.js (U1-U3d) and phase1_step1d_ally_attack_pipeline_parity.js (U3e-g) still passing unchanged |
| `phase1_step1d_ally_attack_pipeline_parity.js` | Combat Rebuild Phase 1 step 1d: the ally-to-enemy path (plain ally, Hadrian's basic fallback, and his Crushing Blow/Groundbreaker actives) vs their three kept oracles -- forced-roll unit parity, the "effect changed something" control check, and the Kessa/Hadrian asymmetries preserved on purpose |
| `phase1_step1e_i_player_attack_pipeline_parity.js` | Combat Rebuild Phase 1 step 1e-i: the player's basic attack vs playerAttackLegacy -- forced-roll unit parity (both damage branches, banked Defense, Siege Corps purity fix, Opening Reach/Borrowed Seconds/Feint, kill/non-kill reactions, gear multipliers), the "effect changed something" control check |
| `phase1_step1e_ii_tactics_pipeline_parity.js` | Combat Rebuild Phase 1 step 1e-ii: Decoy/Ambush/Disarm vs their three kept oracles -- forced-roll unit parity and the asymmetries preserved on purpose (no riposteCounterOnPlayer/Arena Riposte, unconditional Opening Reach and on-hit effects, always-"physical" reporting even on a mage's hit). Feint is not migrated (no attack roll at all). Also carries 3 non-parity step 1e §4 gap-fix checks: Decoy/Ambush now run `lowHealthTriggerChecks`, and Ambush now runs the dodge/Riposte/evasion follow-ups too (both confirmed absent on the Legacy oracle, not just present on the new code) |
| `phase1_step1e_iii_elements_pipeline_parity.js` | Combat Rebuild Phase 1 step 1e-iii: the 7 damage-dealing elements vs useElementAbilityLegacy -- one hit/miss scenario per element, Lightning's own independent double-roll and its kill-gated second hit, the shared purity fixes, and the synergy/Spell-Echo-before-kill-check ordering useElementAbilityLegacy's own tail preserves. Stoneskin (earth) is not migrated (no attack roll) but is re-verified for regression safety |
| `apothecary_action_tracking_ledger.js` | Combat Rebuild Phase 1 step 1e §4 gap fix: apothecary abilities now run `applyEndlessStudy`/`applyWanderersReward`/`applyActionTypeTracking` (previously skipped entirely) -- Endless Study/Wanderer's Reward firing and recording the right key, action-type tracking under its own new "apothecary" category, and Momentum Unbound's rhythm-shift check treating it as genuinely distinct from an attack |
| `test_strike_proof_ledger.js` | Step 1e completion handoff §4: registers a test-only `test_strike` action definition at runtime (never written to disk) and drives it through `js/engine/resolver.js`'s generic `usePlayerAction` -- proves a brand-new action runs through all five pipeline steps, deals damage via the shared `playerCore` formula, applies its declared `onHitChanceEffect`, respects its own cooldown, and counts toward action tracking, with zero changes to `pipeline.js`/`combat.js`/`PIPELINE_HOOKS` beyond the one generic hook mechanism already committed separately for this purpose |

This table isn't exhaustive -- later Combat Rebuild Phase 1 steps (1f,
1g, 1h) added further ledgers (field-move batches, Dregnar's targeting,
reaction/tick coverage, ...) not yet backfilled here. See each step's
own `tools/combat_1*_coverage.md` for what a given ledger actually
exercises; `run_all.js`'s own `LEDGERS` array is the authoritative list
of what runs.

## The frozen Legacy-oracle fixtures (`fixtures/*.json`)

Six of the parity ledgers above (`phase1_step1b/c/d/e_i/e_ii/e_iii_pipeline_parity.js`)
compare the new pipeline-based code against the ORIGINAL per-pair
function it replaced (`resolveEnemyRetaliation`, `playerAttackLegacy`,
`useElementAbilityLegacy`, ...). Combat Rebuild Phase 1 step 1h-ii
deleted all 15 of those functions once they had no caller left besides
these harnesses' own oracle calls — so, as of step 1h-i, each
harness's oracle output is frozen once into an on-disk JSON fixture
(`tools/tests/fixtures/<ledger-name>.json`) instead of calling the live
Legacy function every run:

```
FREEZE_LEGACY_ORACLES=1 node tools/tests/<one-of-the-six>.js   # (re)writes the fixture
node tools/tests/<one-of-the-six>.js                            # normal run: reads it back
```

**These fixtures can never be regenerated** — the functions that
produced them no longer exist anywhere in the codebase. Don't delete
or hand-edit them; a ledger that needs a new scenario added after step
1h gets that scenario's old-side expectation some other way (a
hardcoded known-true fact, same as the 3 Decoy/Ambush scenarios step
1h-ii's own fix used), not by re-freezing.

A frozen fixture's `snap` field is a `JSON.stringify` of `state.combat`
captured BEFORE steps 1h-iii/1h-iv existed, so it's permanently in the
old flat shape (every `PLAYER_FIELDS`/`PER_ENEMY_FIELDS` field sitting
directly on `combat`, not nested under `combat.player`/
`combat.enemies[i]`) with property-insertion order from that era. Both
proxies behind that flat shape are now deleted, so each of these six
ledgers' own `snapshot()` function reconstructs it on the NEW side
too — merging `.player` back up and copying the active enemy's
`PER_ENEMY_FIELDS` values back onto the flattened copy, both by name,
never a wholesale object merge — then compares via a stable/sorted-key
serialization rather than raw string equality, since insertion order
can never match the frozen fixture's again either. If you add a field
to `PLAYER_FIELDS`/`PER_ENEMY_FIELDS` in `combat.js`, these six
`snapshot()` functions need no change — they already flatten
everything currently in `combat.player`/the active enemy slot, by
iterating the live `PLAYER_FIELDS`/`PER_ENEMY_FIELDS` arrays
themselves, not a hardcoded list.

## Adding a ledger

Each file is a standalone Playwright script against `http://localhost:8949`
(the runner starts that server) and must end with exactly one line on
stdout: `` `RESULT: ${passed}/${total}` `` — that's the only contract
`run_all.js` depends on. Everything else in a ledger (its own pretty-printed
JSON, FAILURES listings, per-case detail) is free-form, for a human
reading a failure. Add the new filename to the `LEDGERS` array at the top
of `run_all.js`.
