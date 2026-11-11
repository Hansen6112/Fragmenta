# Step 1g coverage table

What this covers: every path step 1g (1g-i through 1g-vii) built or
touched — Dregnar's targeting, the three fixes carried over from 1f
(Groundbreaker's splash, in-combat healing, P1's own hardening), and
all five field-move batches — each row maps a declared field, path, or
check to the test scenario(s) that actually exercise it, same
convention `combat_1e_coverage.md`/`combat_1f_coverage.md` already use.
A row with no scenario is marked **not independently tested** rather
than silently assumed covered.

Out of scope: step 1h (deleting the old per-pair paths, the dead
`resolveEnemyRetaliation`, every `*Legacy` function, the `state.combat.*`
aliases wired in 1e/1g, and the `PER_ENEMY_FIELDS` proxy itself); the
Phase 1 acceptance check (spec §7); turning the U switches on.

## 1g-i: Dregnar's targeting

| Check | Gates | Test(s) |
|---|---|---|
| Discrepancy disclosed: Dregnar's `dregnarResolveDamagingAttempt` already called `pickEnemyAttackTarget` + dispatched to `resolveEnemyAttackOnPlayer`/`OnAlly`, identically to the ordinary `resolveEnemyAction` path (both pre-date this step) — the handoff's premise that only Dregnar bypassed the shared step didn't hold against live code | n/a (disclosure, not a code gate) | read against both functions side by side before any edit |
| `resolveEnemySingleTargetAttempt` (new, `combat.js`): the shared pick-target-and-dispatch step, extracted so Dregnar and every ordinary enemy call the exact same function instead of each keeping a private copy | both callers reach the player with no allies present, and the single alive ally when the player is downed, with Dregnar's own DRA-P03 bonus wrapping intact either way | `P1G-I-DREGNAR-PLAYER-01`, `-ALLY-01`, `-BONUS-WRAP-01`, `P1G-I-ORDINARY-PLAYER-01`, `-ALLY-01` (`phase1_step1g_i_dregnar_targeting_parity.js`) |
| `tools/audit.js` P1: Dregnar's `/^resolve[Dd]regnar/`/`/^dregnarResolve/` exemption deleted | 0 matches before AND after deletion (confirms the exemption was already a no-op) | `audit.js`'s own P1 count, re-verified immediately after deletion |

## 1g-ii §2a: Groundbreaker's splash through steps 4-5

| Check | Gates | Test(s) |
|---|---|---|
| `targeting: "packSplash"` (new, `js/data/hadrian.js`'s Groundbreaker entry) — `chooseTargets` (step 2) returns `[primary, ...everyOtherAliveEnemy]` for a packSplash action, same order the old private loop hit them | the splash target set itself | `P1D-HA-GB-HIT-01` (primary hit + splash onto the second enemy), pre-existing, re-verified against the new implementation |
| `kitAllyAbilitySplash` (new formula, `js/data/actions.js`): reuses the primary hit's own `baseAtk`/`splashAtkMult`, no second hit roll, no bankedDefKit/sangMit adjustment (neither ever applied to a splash target) | splash damage number, byte-identical to the old inline math | `P1D-HA-GB-HIT-01`, `-ASCENDED-01`, `-SPLASHKILL-01` (`phase1_step1d_ally_attack_pipeline_parity.js`) |
| Each splash hit runs through `calculateDamage`/`applyAndReact` (steps 4-5) instead of `e.hp -=` directly | P1 (no exemption needed for splash HP writes any more) | `audit.js`'s own P1 count (0, with `useHadrianActive` removed from the allow-list) |
| Real bug found and fixed: the splash target's accuracy debuff must apply BEFORE that target's own kill resolves (matching `useHadrianActiveLegacy`'s exact order), not after — applying it after can read `state.combat` once a splash kill has already ended the fight, crashing on the next enemy's debuff write | a splash-only kill that ends the fight on the LAST enemy standing | `P1D-HA-GB-SPLASHKILL-01` (caught the bug on the first implementation attempt, before the fix) |

## 1g-ii §2b: in-combat healing through `applyHealing`

| Check | Gates | Test(s) |
|---|---|---|
| `applyHealing(target, amount, source, ctx)` (new, `combat.js`): one shared primitive for ANY fighter (player/ally/enemy), each caller's own clamping (`Math.min(max, current + amount)`) preserved exactly | the primitive itself, all three target kinds, and the `amount <= 0` no-op | `P1G-II-HEALING-PLAYER-01`, `-ALLY-01`, `-ENEMY-01`, `-NOOP-01` (`phase1_step1g_ii_healing_parity.js`) |
| `tickEnemyPassives`'s `regenPerTurn` trigger | enemy self-regen (Ancient Resilience et al.) | `P1G-II-TICK-REGEN-01`, `-CLAMP-01` |
| `tickEnemyPassives`'s `healPctIfMaxed` branch of `periodicSummon` | Dreadroot's Corrupted Grove self-heal when its summon cap is already full | `P1G-II-TICK-HEALMAXED-01` |
| `resolveEnemyAction`'s `healSelfPct` branch | an enemy active's self-heal (Arcane Barrier, Flesh Reconstruction) | `P1G-II-ENEMYSELFHEAL-01` |
| `allySupportAction`'s ally-heals-ally branch | Kessa's Support stance mending a different ally | `P1G-II-ALLYSUPPORT-01`, `-CLAMP-01` |
| `applyConsumableEffectToAlly`'s heal-type branch | a heal-type consumable used on an ally | `P1G-II-CONSUMABLE-01`, `-CLAMP-01` |
| `useHadrianActive`'s `healPct` branch | Unyielding Advance's self-heal — flavor line still reports the pre-clamp `healAmount` unchanged (a pre-existing quirk, deliberately not corrected here) | `P1G-II-HADRIANHEAL-01`, `-CLAMP-01` |
| `tools/audit.js` P1 extended to HP increases (`+=`, `= Math.min(...)`), with `applyHeal`/`applyHealing` added to the allow-list | every one of the six paths above now routes through the one shared primitive | `audit.js`'s own P1 count (0) |
| Confirmed, not assumed: out-of-combat healing (inns, the healer, potions used outside a fight, injury cures) lives entirely outside the three P1 files | P1's own scope stays correct | read each file in turn before relying on it |

## 1g-ii §2c: P1_PATTERN hardened

| Check | Gates | Test(s) |
|---|---|---|
| Self-assignment decrease form (`x.hp = x.hp - ...`, enforced via backreference so both sides must be the identical expression) | a disguised decrease that `-=` alone wouldn't catch | deliberate break-and-revert, caught and reverted clean |
| Zero-floored subtraction form (`x.hp = Math.max(0, ... - ...)`) | same, for the floor-clamped decrease shape already used by 3 existing (already-allowed) functions | deliberate break-and-revert, caught and reverted clean |
| Confirmed, not assumed: both new forms match 0 NEW violations against live code (the 3 real matches were already inside allowed functions) | no new allow-list entries needed | read every match produced by the new pattern before relying on it |

## 1g-iii through 1g-vii: the 117-field move

Every batch uses `PLAYER_FIELDS`/`wirePlayerFieldsProxy` (`combat.js`),
the same mechanism 1e §3.3 proved for its own 31-field move, except
1g-vii (see its own row). Each batch's own accessor/round-trip/isolation
checks are the structural proof; a real pipeline mechanic exercised
end to end is the behavioral proof.

| Batch | Fields | Mechanism | Test(s) |
|---|---|---|---|
| 1g-iii: once-per-fight/cooldown flags | 19 | `PLAYER_FIELDS` | `P1G-III-ACCESSOR-01`, `-ROUNDTRIP-01/02`, `-ISOLATION-01`, `-MECHANIC-GUARDIANSPIRIT-01`, `-MECHANIC-MIRRORSOUL-01` (`phase1_step1g_iii_field_move_batch1_ledger.js`) |
| 1g-iv: avatarOf* state | 21 | `PLAYER_FIELDS` | `P1G-IV-ACCESSOR-01`, `-ROUNDTRIP-01`, `-ISOLATION-01`, `-MECHANIC-ENDURANCE-01`, `-MECHANIC-DEVOTION-01` (`phase1_step1g_iv_field_move_batch2_ledger.js`) |
| 1g-v: set/gear stacks and bonuses | 37 (handoff's own "about 41" was approximate — the ledger's grouping is the authority) | `PLAYER_FIELDS` | `P1G-V-ACCESSOR-01`, `-ROUNDTRIP-01`, `-ISOLATION-01`, `-MECHANIC-GROUNDBREAKERDEBUFF-01` (`phase1_step1g_v_field_move_batch3_ledger.js`) |
| 1g-vi: core player combat state | 22 (of the handoff's 24 named — `summonLifetimeCounts`/`enemyActedFirstThisRound` reclassified STRUCTURAL instead, see below) | `PLAYER_FIELDS` | `P1G-VI-ACCESSOR-01`, `-ROUNDTRIP-01`, `-ISOLATION-01`, `-STRUCTURAL-01`, `-MECHANIC-STONESPATIENCE-01` (`phase1_step1g_vi_field_move_batch4_ledger.js`) |
| 1g-vii: enemy per-slot state (incl. HP) | 16 | `PER_ENEMY_FIELDS`/`wireActiveEnemyProxy`, now recognized as "moved" (verified, not a new wiring — see below) | `P1G-VII-INDEPENDENCE-01`, `-ALIAS-FOLLOWS-ACTIVE-01`, `-ALIAS-WRITE-ROUTES-TO-ACTIVE-01` (`phase1_step1g_vii_field_move_batch5_ledger.js`) |

**Check before moving, per the handoff's own instruction (1g-vi):**
`summonLifetimeCounts` (caps an enemy summon ability's lifetime
fight-wide, `resolveEnemySummon` — regardless of which pack member
casts it) and `enemyActedFirstThisRound` (describes THIS ROUND's
initiative order, `resolveSpeedInitiative` — not any one fighter's own
state, even though a player-side passive reads it) are both genuinely
fight-wide. Reclassified `STRUCTURAL` in `tools/combat_field_ledger.js`
instead of moved, leaving the handoff's "~22" estimate exact once
excluded.

**1g-vii is the one batch with no code change.** Read against the live
`startCombat` wiring, every enemy slot has always been its own object
literal with `hp`/`maxHp`/`corroded`/... as its own plain properties —
never shared, never flat on `combat`, since before Phase 1 existed.
`wireActiveEnemyProxy`'s `combat.<field>` alias is a convenience
("whichever enemy is active") on top of that already-correct storage,
the same relationship `wirePlayerFieldsProxy` has to its own private
store. `tools/combat_field_ledger.js` now recognizes `PER_ENEMY_FIELDS`
membership as `storageMoved = true`, which is what brings the ledger to
**0 fields left to move** — a ledger-accounting correction, verified
against live source, not a data relocation.

## Audit rules as coverage

Same point `combat_1e_coverage.md`/`combat_1f_coverage.md`'s own
addenda make for P2/P4: these catch a regression mechanically rather
than requiring a human to notice it.

- **P1** (extended three times this step): `useHadrianActive` and
  Dregnar's own exemption removed (both now provably unnecessary);
  extended to HP increases (`+=`, `= Math.min(...)`) with `applyHeal`/
  `applyHealing` allow-listed; hardened against two more disguised
  decrease forms. 0 hits throughout, each extension verified with a
  deliberate break-and-revert before being relied on.
- **P4**: unchanged this step — no new per-ability/per-ally identity
  branches introduced anywhere in 1g's own work.

## Summary

All five "Done when" items from the governing handoff: Dregnar's
targeting goes through the one shared step and his exemption is gone;
Groundbreaker's splash runs through steps 4-5 and its exemption is
gone; all six in-combat heal paths run through `applyHealing`, with P1
covering HP in every direction and form; all 117 fields are accounted
for across five batches (101 genuinely moved into a new private store,
16 recognized as already correctly stored behind the older
`PER_ENEMY_FIELDS` proxy), ledger at **0 fields left to move**; parity
held exact throughout — the full suite (445 scenarios across every
ledger in this engagement) and `tools/audit.js` (0 errors) were run
after every single commit in this step, and `boss_sweep.js`/
`plus3_run.js` stayed bit-for-bit identical to the pre-1g baseline from
the first commit to the last. No check in this step's own scope is
left at **not independently tested**.
