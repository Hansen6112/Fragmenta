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

## U3d — Toxic Preparation vs. an ally

**Zero cells moved on either harness, same reason as U3a:** Toxic
Preparation's trigger item (Executor's Poisoned Dagger) is worn only
by the Veiled Executor (`js/data/bestiary.js`), which isn't in either
harness roster, so this switch also has nothing to trigger from in
boss_sweep.js or plus3_run.js. Reach is Sanguivorum fights, same as
U3a — neither harness contains one.

Full suite 454/454, `tools/audit.js` 0 errors, both harnesses re-run
against U3a's own after-state
(`boss_sweep_u3d.json`/`plus3_u3d.json` vs.
`boss_sweep_u3a.json`/`plus3_u3a.json`).

## U3e — enemy's banked Defense bonus protects from Hadrian too

**Zero cells moved on either harness, but this one has a real,
confirmed trigger surface** (unlike U3a/U3d): Dregnar's own Sure
Foundation (`dra_e05_sure_foundation`, +2 effective Defense on the
NEXT incoming physical hit after Dregnar takes one, one pending
charge) is the one of the three mechanics U3e covers that's actually
wired to re-grant in `applyAndReactAllyActor`, and Dregnar is in
plus3_run.js's own roster. It needs a specific sequence (another
physical hit lands on Dregnar, then Hadrian's hit lands before the
charge expires) and is a flat, modest +2 Defense when it does — small
enough, and conditional enough, to plausibly not cross the 3-point
threshold at 200 trials/cell even though it's genuinely firing some
of the time. Handoff §6 explicitly expects U3e (and U3f/U3g/U1) to
make Hadrian fights harder; a small, below-threshold effect here
isn't a sign the switch did nothing, just that this particular
mechanic's magnitude is modest against the current roster.

Found and fixed a real test-infrastructure bug surfaced by this flip
(same family as U3b's, different files): `phase1_step1c_ally_pipeline_parity.js`
and `phase1_step1d_ally_attack_pipeline_parity.js` compare live output
against a fixture frozen in step 1h-i, before any COMBAT_UNIFY switch
existed — their parity claim only ever held with every switch off.
Once U3e's own default flipped true, 13 of their scenarios started
comparing U3e's intentionally new state (freshly-zeroed/re-granted
banked-Defense fields written onto the creature object on every
kit-bearing ally hit, even where the actual bonus value didn't
change) against the pre-switch oracle, and failed for the right
reason but the wrong test (441/454). Fixed by pinning `COMBAT_UNIFY`
to all-false inside both files' own `runOne`, same fix as
`combat_unify_switches_ledger.js` got for U3b.

Full suite 454/454 (with that fix in place), `tools/audit.js` 0
errors, both harnesses re-run against U3d's own after-state
(`boss_sweep_u3e.json`/`plus3_u3e.json` vs.
`boss_sweep_u3d.json`/`plus3_u3d.json`).

## U3f — Smuggler's Guard/Commander's Poise vs. Hadrian

**Zero cells moved on either harness, real trigger surface
confirmed:** the Highway Captain (`boss_sweep.js`'s own roster)
wears Commander's Insignia, granting Commander's Poise
(`sang_cu_ie011_commanders_poise` — "the first successful damaging
attack each combat deals 10% less final damage, once per combat").
A single, one-time 10% reduction on whichever hit happens to land
first is a small enough and rare enough edge to plausibly not move a
200-trial cell's win rate by 3 points, even with the trigger
genuinely present and now applying to Hadrian's hits too.

Full suite 454/454, `tools/audit.js` 0 errors, both harnesses re-run
against U3e's own after-state
(`boss_sweep_u3f.json`/`plus3_u3f.json` vs.
`boss_sweep_u3e.json`/`plus3_u3e.json`).
