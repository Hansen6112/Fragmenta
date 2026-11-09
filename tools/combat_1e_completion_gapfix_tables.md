# Step 1e §6 — before/after tables for the two gap fixes (D5)

Decision D5 (Tyler, 9 Nov 2026): the two gap fixes (`f746464`, `d16e380`)
are accepted pending their before/after numbers. This is that delivery.

Methodology: both Layer 2 harnesses (`boss_sweep.js`, 16 bosses × 2
classes × alone/as-spawned, 200/100 seeded trials per cell;
`plus3_run.js`, Dregnar/Arbitarius × 2 classes × 3 gear tiers, 200 seeded
trials per cell) were re-run against the commit immediately before each
fix and immediately after, with every other variable held fixed
(deterministic seeding, same build otherwise). Every cell not listed
below is bit-for-bit identical before/after — these two tables list
every cell that moved at all, not a filtered subset.

## `f746464` — Decoy/Ambush now run `lowHealthTriggerChecks`; Ambush also gets the dodge/Laughing Gale/Endless Horizon/Riposte follow-up block

`boss_sweep.js`: **zero cells moved.** None of the 16 bosses × 2 classes
× alone/as-spawned cells happen to put a warrior/mage build in a state
where Decoy or Ambush both (a) gets used and (b) crosses the specific
thresholds these fixes gate on (Rally the Line's <50% Health trigger, or
a round where Ambush's own retaliation-exclusion leaves every other
check's gate satisfied) during that cell's own seeded trials.

`plus3_run.js`: **2 cells moved**, both at warrior class, "normal" gear
tier (the tier most likely to actually need a low-Health proc or a
dodge-bonus trigger — "expected"/"bis" gear wins fast enough that these
late-game triggers rarely fire in those cells' own seeded trials):

| Boss | Cell | Metric | Before | After | Δ |
|---|---|---|---|---|---|
| Dregnar Ashvein | warrior / normal | downFrequency | 0.08 | 0.05 | −0.03 |
| Dregnar Ashvein | warrior / normal | avg ally damage taken (Hadrian) | 158 | 156 | −2 |
| Dregnar Ashvein | warrior / normal | avg ally damage taken (Mercenary 1) | 47 | 45 | −2 |
| Dregnar Ashvein | warrior / normal | avg ally damage taken (Kessa) | 49 | 43 | −6 |
| Arbitarius Commander | warrior / normal | winRate | 0.045 | 0.095 | +0.05 |
| Arbitarius Commander | warrior / normal | avgPlayerDamageTaken | 242 | 240 | −2 |
| Arbitarius Commander | warrior / normal | downFrequency | 0.865 | 0.885 | +0.02 |
| Arbitarius Commander | warrior / normal | avg ally damage taken (Hadrian) | 300 | 294 | −6 |
| Arbitarius Commander | warrior / normal | avg ally damage taken (Kessa) | 178 | 175 | −3 |

(`avgRounds`, `avgGroupSize`, `compositionCounts`, and every mage-class
or non-"normal"-gear cell for both bosses: unchanged.)

**What a player will notice:** against Arbitarius Commander specifically,
at normal gear, win rate goes up about 5 percentage points (4.5% → 9.5%
— both still a hard fight, this isn't a swing into "easy") and the
player goes down slightly more often (86.5% → 88.5% of fights) while
taking marginally less total damage and dealing marginally less damage
to their own allies' incoming totals — consistent with "the fix lets
Decoy/Ambush occasionally land a Rally-the-Line-style survivability
proc or a stray dodge bonus they couldn't reach before," a small,
genuine improvement at the margin, not a different fight. Against
Dregnar Ashvein, the only visible change is going down ~3 percentage
points less often. No cell on either boss moves anywhere near the 10
percentage-point stop-and-ask threshold §2's own U-switch rollout uses
as a reference scale.

## `d16e380` — apothecary abilities now run the action-tracking trio

**No measurable Layer 2 impact from either harness, and this needs its
own disclosure, not a silent "0 cells moved":** both `boss_sweep.js` and
`plus3_run.js` only ever simulate the **warrior** and **mage** classes
(confirmed by reading each harness's own `CLASSES`/class-selection code)
— **neither harness ever runs an apothecary-class character**, the only
class this fix actually touches (Endless Study/Wanderer's Reward/
Momentum Unbound only fire for an apothecary cast at all if the player
is apothecary-classed in the first place). So this fix's real-world
impact (a genuine, small buff for an apothecary build that happens to
own Endless Study/Wanderer's Reward/Momentum Unbound and wasn't
benefiting from them on their own kit before) is real but **not
observable in either existing sweep** — confirming "0 cells differ" here
would be misleading without this caveat, since it reads as "no impact"
rather than "no coverage." Measuring it properly would need extending
one of the harnesses with an apothecary-class run, which neither
currently supports; flagged as a gap rather than worked around
silently, since building that out is a materially separate task from
delivering this table.

## Acceptance

Per D5, acceptance is confirmed once Tyler has seen this file.
