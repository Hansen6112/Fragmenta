# Groundbreaker accuracy-restore fix (`0ae15f9`) — before/after

Phase 1 close-out handoff §3: `0ae15f9`'s Groundbreaker accuracy-debuff
fix is a correct, accepted bug fix, but it changes behavior, so it's
logged the same way the two step 1e gap fixes were
(`tools/combat_1e_completion_gapfix_tables.md`) — one line on what a
player would notice, before/after numbers on both Layer 2 harnesses
(even where unchanged), and this entry itself as the listed-change
record.

## The bug

`applyGroundbreakerAccuracyDebuff`/`tickGroundbreakerDebuffs`
(`js/engine/companion.js`): Hadrian's Groundbreaker active debuffs an
enemy's Accuracy by 10 for its duration, clamped at 0 (Accuracy can't
go negative). The clamp was correct; the RESTORE wasn't — it recorded
and re-added the full 10, not the amount actually removed. An enemy
with less than 10 base Accuracy (say, 6) only ever lost 6 to the
clamp, but got the full 10 back when the debuff expired, ending up
permanently 4 Accuracy ABOVE its own starting value — a real, if
narrow, enemy-side buff bug, the opposite of what Groundbreaker is
supposed to do.

**What a player would notice:** against a specific narrow band of weak
enemies (base Accuracy under 10 — see below), that one enemy's Accuracy
would creep upward by a few points every time Hadrian re-cast
Groundbreaker on it and the debuff expired, compounding fight over
fight if it survived to be re-debuffed again. Against anything with 10
or more Accuracy (every boss currently in either Layer 2 harness — see
below), nothing changes at all: the clamp never engages, so the bug
never had anything to over-restore.

## Before/after: both Layer 2 harnesses

Methodology: `boss_sweep.js` (16 bosses × 5 classes × alone/as-spawned)
and `plus3_run.js` (Dregnar Ashvein/Arbitarius Commander × 5 classes ×
3 gear tiers, the legal "player + Kessa + Hadrian + 1 merc" roster) —
both already include Hadrian, so Groundbreaker fires in both — were
re-run against the commit immediately before the fix (`3a778a6`) and
immediately after (`0ae15f9`), same seeding, same build otherwise.

**`boss_sweep.js`: zero cells moved — confirmed, not assumed.** Every
one of the 16 bosses' real in-combat (post-`PLAYER_STAT_SCALE`)
Accuracy, checked directly rather than guessed from the unscaled
`BESTIARY` stat:

| Boss | Scaled Accuracy |
|---|---|
| bandit_captain | 17 |
| tribal_warleader | 17 |
| merchant_lord_guard_captain | 17 |
| amahri_field_commander | 18 |
| mercenary_commander | 19 |
| bandit_warlord | 18 |
| sardarr_army_commander | 19 |
| arbitarius_commander | 40 |
| (every other boss in the sweep) | higher still |

All comfortably above Groundbreaker's 10-point debuff — the clamp
(and therefore the bug) never engages against any of them, so the fix
has nothing to change here. This isn't a coverage gap the way the
apothecary class was for the step 1e gap fix (§5 of this same handoff
adds that coverage) — it's a genuine "this boss roster never exercises
the buggy path" finding, confirmed by direct measurement, not inferred.

**`plus3_run.js`: zero cells moved, same reason.** Dregnar Ashvein
(Accuracy 99) and Arbitarius Commander (Accuracy 40, both at the level
bands these cells use) are both far above the clamp threshold too.

Raw diffs (`boss_sweep_out.json`/`plus3_out.json`, pre-fix vs. post-fix):
byte-for-byte identical on both files — not just "no cell crossed a
reporting threshold," truly zero difference anywhere in either output.

## Register entry

| Fix | Commit | Player-visible effect | boss_sweep.js | plus3_run.js |
|---|---|---|---|---|
| Groundbreaker accuracy-restore over-grant | `0ae15f9` | An enemy with less Accuracy than Groundbreaker's 10-point debuff (none currently in either harness's roster) would have crept permanently ABOVE its own starting Accuracy on every re-cast/expiry cycle; now restores exactly what was removed | 0 cells moved (no boss's Accuracy is below the clamp threshold) | 0 cells moved (same reason) |
