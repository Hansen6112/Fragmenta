# Layer 2 harnesses: boss_sweep.js / plus3_run.js

These two files (plus their shared plumbing, `sim_common.js`) did not exist
anywhere in this repo's git history or in any prior session's own scratch
output before the Damage Types Step 4 handoff. The project's own earlier
convention (see `tools/combat_unify_switch_rollout.md`'s "Post-Phase-1
baseline" section) treated this whole Layer 2 harness as scratch-only,
never git-tracked -- which is exactly why it was lost. Per Tyler's own
explicit instruction on this step's own follow-up ("Commit the harnesses
and baselines"), that convention is overridden here: this directory and
`tools/baselines/` are now the committed, permanent home for both.

## Rebuilt, not recovered

Rebuilt from the methodology already documented across this repo's own
`tools/*.md` files (`phase1_acceptance.md`, `combat_unify_switch_rollout.md`,
`combat_1e_completion_gapfix_tables.md`, `groundbreaker_accuracy_fix_before_after.md`),
not reconstructed from any surviving source. Specific judgment calls made
in the rebuild, each one a real place this file's own behavior could
diverge from whatever the original did:

- **Player turn policy: basic attack only, every round.** `playerAttack(state)`
  already covers every class -- a Mage/Bruise's own basic attack auto-picks
  a known element (`actions.js`'s own `picksElement` comment) -- and matches
  `tools/combatsim.js`'s own `--party` mode precedent. No tactic/active-
  ability AI is reconstructed on top of it. Ally/enemy AI is the real
  engine's own code (`resolveCompanionAction`/`resolveEnemyActiveAbility`),
  never reconstructed.
- **`boss_sweep.js`'s 16-boss roster**: the named faction commander/
  captain/warlord BESTIARY entries (`tribal_warleader` through
  `militia_warleader`), matched by filtering `dangerClass: "boss"` and
  cross-checked against the two names `combat_unify_switch_rollout.md`
  names directly ("Highway Captain", "Roadside Lookout" -> `highway_captain`
  is in the list).
- **Party composition**: player + Kessa + Hadrian + 1 generic merc (the
  real named allies, not 3 generic mercs the way `combatsim.js`'s own
  `--party` mode does it) -- task #56's own documented "legal full party."
  Matters here specifically because Hadrian's own kit is a named expected
  mover in this handoff's own Part C.
- **`plus3_run.js`'s "3 gear tiers"**: undocumented beyond the name in
  every surviving doc. Reconstructed as one level-band below / at-level /
  one level-band above the target's own tier (`sim_common.js`'s
  `gearForTierOffset`).
- **Variant pinning**: a harness-only override of `pickElementVariant`,
  defined entirely inside `sim_common.js` -- never touches `js/`. Enemy
  Mage cells set `.element` directly on the object `generateEnemyMage`
  returns, before spawning -- same non-invasive technique.

## Usage

```
node tools/sim/boss_sweep.js --switch off|on --n 1000 --rows all|existing|new --out <file.json>
node tools/sim/plus3_run.js  --switch off|on --n 1000 --out <file.json>
```

`--switch` patches `js/data/damagetypes.js`'s committed `DAMAGE_TYPES_V2`
line in a VM sandbox only -- the real file on disk is never touched, and
the patch is direction-agnostic (works whichever literal is actually
committed).

## Baselines

Recorded runs live in `tools/baselines/`, named
`post_damage_types_baseline_<commit>.json` plus the raw per-harness
`bs_<on|off>_n1000.json`/`p3_<on|off>_n1000.json` files it was built from,
for whichever commit the "Done when" report for that step was written
against.
