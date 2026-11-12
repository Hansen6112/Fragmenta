# Combat Rebuild Phase 1 close-out handoff §6 — unification switch rollout

Each `COMBAT_UNIFY` switch (`js/engine/pipeline.js`) flipped to `true`
from narrowest to broadest effect, each its own commit (so any one can
be reverted cleanly without touching the others), approved by Tyler
(9 Nov 2026): U1, U2, and the D2 principle behind U3 ("an enemy's kit
applies to whatever it hits").

Per switch: flip it, confirm the full suite still passes (454/454 —
`combat_unify_switches_ledger.js`'s own dedicated "on" test for that
switch forces it locally regardless of the committed default, so this
is really confirming nothing ELSE broke) and `tools/audit.js` stays at
0 errors, then re-run both Layer 2 harnesses (`boss_sweep.js`: 16
bosses x 5 classes x alone/as-spawned; `plus3_run.js`: Dregnar/
Arbitarius x 5 classes x 3 gear tiers) against the state left by the
PREVIOUS switch, and report every cell that moved >= 3 win-rate
points. Stop rule: any single cell moving > 10 points stops the
rollout there, reverts nothing, and that switch's own table goes to
Tyler before the next one is flipped.

All five classes (§5 of this same handoff) are included from the very
first switch onward, so a class-specific effect (if one ever exists)
isn't invisible the way the apothecary gap fix's own impact was on the
old warrior/mage-only harnesses.

## Starting point (§5): all 5 classes, zero switches on

Recorded once, before any switch flip, as the pre-U2 baseline every
switch below is measured against in turn:
`boss_sweep_5class_baseline.json`, `plus3_5class_baseline.json`
(scratchpad `expectedgear_rerun/`, elapsed 145.5s / 30.6s). Apothecary
reads far weaker than the other four classes solo-against-a-boss (its
own class design — "knows more than it hits for" — not a bug): e.g.
against `bandit_captain` (warrior/scout/mage/bruise all at 100%
as-spawned-alone win rate), apothecary is 80%/18% (alone/as-spawned);
against `arbitarius_commander`, apothecary's win rate is the lowest of
the five at every cell, with `avgRounds` near the round cap in several
cells (a genuinely weak personal attacker dragging fights out, not a
stall bug — confirmed the AI still attacks and uses its kit normally).

## U2 — Dregnar's Unquenched Focus vs. an ally

**Zero cells moved on either harness** (confirmed by direct
measurement, not assumed) — expected, not a sign the switch is
inert: U2's own effect only has something to trigger from when an
elemental hit against an ally exists at all, which requires **U1**
also on (`combat_unify_switches_ledger.js`'s own `U2-REQUIRES-U1-01`
test already proves this in isolation: "U2 alone (U1 still off)
changes nothing"). Flipped first anyway, per the handoff's own
narrowest-to-broadest ordering, so U1's own eventual table (last in
this rollout) is the one that actually shows U2's contribution,
isolated against the U1-alone state that precedes it.

Full suite 454/454, `tools/audit.js` 0 errors, both Layer 2 harnesses
re-run against the §5 all-5-classes baseline
(`boss_sweep_u2.json`/`plus3_u2.json` vs.
`boss_sweep_5class_baseline.json`/`plus3_5class_baseline.json`).

**Real test-infrastructure bug found and fixed while verifying U3b
below, disclosed here since it affects every switch from this point
on, not just U3b:** `combat_unify_switches_ledger.js`'s own
`runWithSwitches`/`runWithSwitchesHadrian` helpers snapshotted the
CURRENT `COMBAT_UNIFY` state as their "off" baseline and only forced
the requested `on` keys true — so once a switch's own committed
DEFAULT flips to `true` (this rollout's entire point), that switch's
own dedicated "on changes something" test can no longer show a
difference: "off" silently inherits the new `true` default, so the
comparison is the same state against itself. This was caught by the
suite's own 50-consecutive-run verification (§2) flagging
`U3B-ON-01` as failing roughly 1 run in 25 once U3b's default was
flipped — not a fight-simulation flake, a stale assumption in the
test helper. Fixed by forcing every `COMBAT_UNIFY` key to `false`
first, then applying the requested `on` set, so "off" genuinely means
every switch off regardless of the committed default. Verified with
40 consecutive clean runs of this one ledger file (0 failures) with
both U2 and U3b already `true` in production.

## U3b — Flowing Discipline vs. an ally

**Zero cells moved on either harness.** Flowing Discipline's own
trigger (Dregnar casting Barrier, First Sword's Regalia 6pc, banking
`flowingDisciplinePending` for 2 turns) needs a PHYSICAL hit landing on
an ally within that same short window, which itself only happens when
`pickEnemyAttackTarget`'s own party-share roll picks an ally at all —
a narrow enough combination that it didn't cross the 3-point threshold
in either harness's 200/100-trial cells. A real, measured "no
observable impact in this specific roster," not an assumption.

Full suite 454/454 (with the `combat_unify_switches_ledger.js` fix
above already landed), `tools/audit.js` 0 errors, both harnesses
re-run against U2's own after-state
(`boss_sweep_u3b.json`/`plus3_u3b.json` vs.
`boss_sweep_u2.json`/`plus3_u2.json`).

## U3c — Winter's Verdict vs. an ally

**Zero cells moved on either harness.** Winter's Verdict (First
Sword's Regalia 8pc) fires when the ally carrying `ally.statuses.chilled`
is hit, which needs Chill to already be on an ally in the first place —
same party-share-roll gate as U3b, plus whatever applies Chill in the
current roster, narrow enough to not cross the 3-point threshold here
either.

Full suite 454/454, `tools/audit.js` 0 errors, both harnesses re-run
against U3b's own after-state
(`boss_sweep_u3c.json`/`plus3_u3c.json` vs.
`boss_sweep_u3b.json`/`plus3_u3b.json`).

**Dregnar's combined total change across all three of his switches
(U2 + U3b + U3c):** zero cells moved on either harness, confirmed by
comparing the §5 zero-switches baseline directly against
`boss_sweep_u3c.json`/`plus3_u3c.json` (the state after all three are
on) rather than just summing three zero deltas. None of Unquenched
Focus, Flowing Discipline, or Winter's Verdict crossed the 3-point
threshold individually or cumulatively against this roster at current
trial counts — a real, measured "no impact yet," not an assumption
that three zeros add to zero.

## U3a — Marked Target vs. an ally

**Zero cells moved on either harness, and verified why rather than
just measured:** Marked Target is granted by the "Spotter's Lens"
trinket (`js/data/items.js`), worn in the bestiary only by the
"Roadside Lookout" (`js/data/bestiary.js`) — none of boss_sweep.js's
16 Boss-class humanoids or plus3_run.js's Dregnar/Arbitarius wear it
or anything else carrying `sang_cu_ie002_marked_target`, so the switch
has nothing to trigger from in either harness at all, not merely "not
enough trials to see it." U3a's own reach (handoff §6's table) is
"Sanguivorum fights" specifically — neither harness contains one.
This switch's real impact won't show up until a Sanguivorum
encounter (e.g. one with Roadside Lookout present) is added to a
harness roster; noted here rather than left looking like a false
"no effect."

Full suite 454/454, `tools/audit.js` 0 errors, both harnesses re-run
against U3c's own after-state
(`boss_sweep_u3a.json`/`plus3_u3a.json` vs.
`boss_sweep_u3c.json`/`plus3_u3c.json`).
