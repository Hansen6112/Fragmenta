# Damage Types spec v1.0 — step 2: the system, behind the switch

Governs **"Fragmenta: Damage Types System, Spec v1.0"** (Tyler, 12 Nov
2026, approved) — specifically its order-of-work **step 2**: "Coder:
the system (§2–§3) behind the switch, plus the audit rules (§6)
running as warnings." Steps 1 (Tyler's A1/A2 decisions) and this step
are done. Steps 3 (content passes), 4 (harness encounters, switch on,
new baseline) and Phase 4 (budgets) are **not** — nothing here turns
the switch on, and no roster content has been authored on any
weapon/creature/ability/status yet.

Branch `claude/playable-game-world-2z7goo`, commits `483f22d`..`8f0edd7`,
starting from `204a04d` (the Phase 1 close-out commit).

## What was built

| File | What |
|---|---|
| `js/data/damagetypes.js` (new) | The locked 16-type roster (T1), `DAMAGE_TYPES_V2` (off by default), and the generic math: `damageFamily`, `resistingDefenseValue` (T5/T6), `dmgTagMultiplier` (T2/T4/T9), `isStatusImmune` (T3), `resolveDamageType` (§2's field-priority chain), `resolveStatusDamageType` + a legacy-status bridge, `ATTUNEMENT_TAG_PAIRS` + `playerAttunementDmgTags` (A1), and the switch-gated Frost addition to `ELEMENTS` (A2). |
| `js/data/actions.js` | Every `PIPELINE_FORMULAS` entry that deals damage (enemy→player, enemy→ally, player→enemy, ally→enemy, all 4 DOT ticks, all riposte/reaction formulas) resolves a damage type and applies resist-by-family + tag multiplier when the switch is on. `equipmentWeaponDamageType` reads a combatant's mainhand weapon's type (enemy or ally — same `equipment.mainhand` shape either way). |
| `js/engine/pipeline.js` | `rollPlayerDamageCoreForPipeline` (the player's own spell/weapon core) wired the same way; `applyAndReact`'s player-target branches, the riposte reaction tail, and the DOT-tick tail record the real resolved damage type into `playerLastHitType` under the switch, instead of the raw element key / a hardcoded `"physical"` / the old-roster `statusDamageType`. The old element-vs-element matchup cycle (`js/data/matchups.js`) is forced neutral at its two generic call sites once the switch is on — tags do that job instead. |
| `js/engine/combat.js` | `applyPlayerStatus`/`applyAllyStatus` (the two real choke points every named-status application goes through) check `isStatusImmune` first, ahead of every existing defensive interceptor. |
| `js/engine/state.js` | `GameState.dmgTags` — a **getter**, not a stored field, deriving the player's own Resist/Weak pair fresh from `primaryElement` every read (so a later attunement change, e.g. level 15's Deepen or Conduit Ascendant, can never leave a stale stored tag behind). |
| `tools/audit.js` | D1–D4 as warnings (§6), scoped to what the data model supports today — see "Known gaps" below for where each one is deliberately narrower than the spec's literal wording. |

## Why `dmgTags`, not `tags`

The spec's own field table (§2) names the resist/weak map `tags`.
`BESTIARY` and `ALLY_DEFS` entries already have an unrelated `tags`
array (habitat/faction categorization — e.g. `dregnar_ashvein`'s
`tags: ["dregnar_scripted"]`, 233+ entries). Reusing the name would
silently collide with every one of them the moment content (step 3)
added a `dmgTags`-shaped value under the same key. Used `dmgTags`
throughout instead — same semantics, no collision.

## What's deliberately deferred, and why

- **The 12-group/36-slot injury expansion (T11).** `DAMAGE_TYPE_TO_INJURY_GROUP`
  (`js/engine/state.js`) still only knows the OLD 10-key roster
  (`physical`/`fire`/`lightning`/`acid`/`water`/`air`/`transportation`/
  `force`/`earth`/`bleed`). The new 16-type names (`slashing`, `frost`,
  `poison`, `spatial`, `spirit`, `necrotic`, `divine`, …) aren't mapped
  to any group yet, so an unmapped type falls to the existing `||
  "trauma"` default. Building the real 12×3 structure needs the
  Reference document's own group table, which step 2 wasn't handed —
  that's explicitly a content pass (§5 item 6: "working names from the
  reference; Narrative owns the final names"), not engine work.
- **No ally injury system exists.** The spec's step-3 wording
  ("`playerLastHitType` **and the ally equivalent**") assumes an
  ally-side hit-type/injury mechanic that doesn't exist anywhere in
  this codebase (confirmed by exhaustive grep). Not inventing one here
  — that would be new, unrequested mechanic design, not a fix to
  something that exists.
- **Mirror Soul's own reflection formula** (a player Artifact, narrow
  one-off mechanic) still calls the old `elementMultiplier` unchanged —
  explicitly out of scope, the same way it was excluded from the Phase
  1 U1 switch for an identical reason.
- **Avatar of Knowledge's matchup override** still runs under the
  switch (a neutral `1` passes through unchanged) but isn't re-targeted
  at the new tag system — that's a design decision this spec doesn't
  make.
- **D3 (the per-class guard)** is narrowed to the one concrete,
  class-independent case the data model supports today: no `BESTIARY`
  creature is Resist/Immune to all three Physical sub-types at once.
  The fuller per-class/per-level-band form needs a weapon/action→class
  map this engine doesn't have, plus mage-attunement damage types to
  already exist — both arrive later.
- **D1 is currently "all-warn."** 805 of the audit's 877 warnings are
  D1 "no damageType yet" hits, across every `toHit:"roll"` action,
  every mainhand item, every `BESTIARY` creature, every dot-bearing
  status. That's real, correct signal — it's exactly what the content
  pass (step 3) is supposed to clear, not noise to silence.

## Verification

- **Full suite**: 454/454 at every commit, switch off.
- **Audit**: 0 errors at every commit (877 warnings after step 2a's D1–D4
  addition; unchanged since — none of steps 2b–2d touch content, so the
  D1 count doesn't move).
- **Switch-off harness parity**: `boss_sweep.js`/`plus3_run.js` run at
  current HEAD (`8f0edd7`) against a `git worktree` frozen at `204a04d`
  (the last commit before any Damage Types work), same seeded box,
  same N — **byte-identical** JSON output on every cell, both
  harnesses (`diff` reports no difference, both files).
- **Switch-on crash safety** (not a parity requirement — the switch
  stays off per spec §7 step 1): forced `DAMAGE_TYPES_V2 = true` and
  ran the full suite after each of steps 2b–2d. No crashes, no changed
  damage numbers or message text anywhere. The only failures are
  `snapMatch`-only ones in five pre-existing Legacy-parity fixtures
  (`phase1_step1b`/`1e-i`/`1e-ii`/`1e-iii`/`1f-iv`), whose frozen
  snapshots compare `playerLastHitType`'s exact string and were never
  updated for a value this step can now change — the same "parity test
  assumes every system is off" bug class already found and fixed twice
  for `COMBAT_UNIFY` switches in Phase 1. Left alone here: the switch
  stays off, and these fixtures get their fix budgeted into the real
  switch-on step (§7 step 3), not invented speculatively now.

## What's next

Per the spec's own order of work: step 3 is the content passes (§5) —
weapon/creature/ability/status `damageType` and `dmgTags` data,
candidate lists from Tyler. Step 4 is adding elemental/mixed encounters
to both Layer 2 harnesses, turning `DAMAGE_TYPES_V2` on for real, the
before/after report (stop at any cell moving ≥10 points), and recording
`post_damage_types_baseline_<commit>.json`. Neither is started here.
