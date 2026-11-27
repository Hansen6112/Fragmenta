# R1 measurement log (task #49)

Phase 2 spec's R1 ("Party holders: `holders` widen to the player and
allies for every kind B and kind D entry and every set bonus") is the
first genuinely balance-changing step in the Combat Rebuild engagement,
so it's measured and logged separately from the migration-only steps
above it, per the spec's own process requirement ("any cell that moves
more than 10 points goes to Tyler").

## R1a (27 Nov) -- the 20 entries confirmed safe as a pure `holders` +
`when` edit

Committed as `cbaee4d`. 20 entries (Guardian Spirit, Guided Footsteps,
Never Where Expected, Evasive Guard, River Warden:6, Blessing of
Freedom evade+heal, Blessing of Compassion, Blessing of the Tide,
Blessing of Renewal, Keeper of History, Fragmenta:6, Drake Hunter:6,
Blessing of Stone, Shield Wall, Siege Corps:6, Legion:6, two M1
placeholders, two inert Surging Conduit upgrades) plus 6 upgrade-tier
reversals of prior player-only rulings (Executioner threshold x4,
Opening Reach/Norrvael:6, Brace base value/Stonewarden:4). `holders`
widens structurally; the real on/off switch is `COMBAT_UNIFY.R1` (off
by default), read from each entry's own `when` (or, for upgrade-tier
entries, `resolveUpgradedValue`'s new `when` check -- a 27 Nov addition,
since that function didn't consult `when` at all before this).

Excluded from R1a (needs real engine code, not a data/when edit --
**R1b**, not yet built): the ~55-60 entries whose behavior hardcodes
`combat.player.*`/`state.combat.player.*` fields directly (allies have
no `.combat` substructure at all), plus Avatar of Freedom and Mercy of
the Veil (no registry entry exists for either -- raw inline player-only
checks in combat.js), plus the kind-D Hadrian's-kit-path gap (pipeline
wiring, not data).

### Standard harness result: a blind spot, not a measurement

`plus3_run.js` (R1 off vs on, both `DAMAGE_TYPES_V2` states, n=1000,
seed 777) came back **exactly byte-identical on every metric in every
cell**. Traced to the root cause, confirmed by direct inspection: both
`plus3_run.js` and `boss_sweep.js` pick gear by raw-stat scoring
(`gearFor`/`gearForTierOffset`'s own "best atk/def/health per slot"),
and that scoring never once selects any of R1a's 20 touched items, for
any class, any of the 3 gear tiers, or a wide level range -- checked
directly, not inferred. Neither harness, as built, can exercise this
content at all; this was already true for the PLAYER pre-R1, so the
zero delta says nothing about R1's own effect.

Raw output: `tools/baselines/r1a_plus3_baseline_dtoff.json` (R1 off),
`r1a_plus3_r1on_dtoff.json` (R1 on, same seed) -- diff them to confirm
byte-identical directly.

### Forced-equip measurement: `tools/sim/r1_forced_measure.js`

Built per the same discipline the spec already calls for on R3 ("the
harness can't see this, use forced test cases instead"). Forces Kessa
to carry the 4 effect ids + 5 set tiers whose dispatch is guaranteed to
fire just from existing and taking hits (`rollToHit.defender`'s
miss/evasion chain, `calculateDamage.incoming`'s Blessing of
Stone/Shield Wall) -- not the other 11 R1a entries, which depend on
Kessa's own action/kill pattern or the enemy's own tags and aren't
reliably exercised by this harness's existing AI (their dispatch
correctness is already proven by this engagement's own test-strike/
Amendment-1-style proofs). Dregnar Ashvein, `undergeared` gear tier
(plus3_run's own "harder, more informative" tier -- the plain tier
saturates win rate near 100% with no R1-touched gear at all, leaving no
headroom), n=1000, seed 777.

| Class | Win rate before -> after | Delta (pts) | Ally deaths/fight | Ally HP% | Player HP% |
|---|---|---|---|---|---|
| warrior | 73.0% -> 86.9% | **+13.9** | 1.51 -> 1.05 | 21.0 -> 38.6 | 24.9 -> 29.1 |
| scout | 66.2% -> 84.5% | **+18.3** | 1.61 -> 1.17 | 19.9 -> 35.0 | 20.0 -> 25.9 |
| apothecary | 60.9% -> 82.0% | **+21.1** | 1.76 -> 1.23 | 17.2 -> 33.5 | 19.1 -> 24.2 |
| mage | 89.2% -> 94.1% | +4.9 | 0.82 -> 0.62 | 38.5 -> 51.5 | 31.4 -> 31.9 |
| bruise | 85.1% -> 92.2% | +7.1 | 0.99 -> 0.72 | 33.7 -> 48.6 | 28.7 -> 30.4 |

3 of 5 classes exceed the 10-point threshold (warrior, scout,
apothecary); ally survivability improves substantially across every
class even where the win-rate delta stays under it. Raw output:
`tools/baselines/r1a_forced_measure_n1000.json`.

**Tyler's ruling (27 Nov):** accept the measured magnitude as-is --
allies benefiting meaningfully from defensive gear they wear is the
intended effect of R1, not a bug to tune away. Proceed to R1b.

## R1b -- not yet started

Scope: build the per-ally state-tracking mechanism the ~55-60 excluded
entries need (most read/write `combat.player.*`/`state.combat.player.*`
directly; allies have no `.combat` substructure at all today), then
widen those entries' `holders`+`when` the same way R1a did. Separate
measurement pass once built, same discipline as above.

## R2, R3 -- not yet started

R2 ("Enemy holders") and R3 (bucketed combination replacing the
uncapped product, plus the forced-worst-case-stack hit measurement the
spec's own §4 already calls for) each get their own flip + measurement
pass here, in order, once R1 (R1a+R1b) is complete.
