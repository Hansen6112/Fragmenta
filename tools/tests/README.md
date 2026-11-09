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
| `combat_unify_switches_ledger.js` | Handoff §2 (9 Nov): COMBAT_UNIFY switches (U1/U2/U3a-d) in pipeline.js -- each one, forced on, changes something on a built-to-trigger scenario; off (the default) is covered by phase1_step1c_ally_pipeline_parity.js still passing unchanged |

## Adding a ledger

Each file is a standalone Playwright script against `http://localhost:8949`
(the runner starts that server) and must end with exactly one line on
stdout: `` `RESULT: ${passed}/${total}` `` — that's the only contract
`run_all.js` depends on. Everything else in a ledger (its own pretty-printed
JSON, FAILURES listings, per-case detail) is free-form, for a human
reading a failure. Add the new filename to the `LEDGERS` array at the top
of `run_all.js`.
