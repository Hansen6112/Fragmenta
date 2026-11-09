# Combat path-difference register

Every known difference between the enemy-attacks-player path and the
enemy-attacks-ally path in `js/engine/pipeline.js` (step 1b/1c), plus
any found later. Each row: the mechanic, which path has it, where it
lives, its parity test, its **kind**, and its **status**.

Kinds (Tyler, 9 Nov 2026):

| Kind | Meaning | Default status |
|---|---|---|
| **A** | Enemy-side rule — part of the attacker's own kit, but today only fires when it hits the player | Gets a `U3` switch (`COMBAT_UNIFY` in pipeline.js); turned on per decision D2 once built |
| **B** | Player-only gear defense (reacts to the player specifically being attacked) | Approved to extend to allies per D3; **built in Phase 2** (the modifier registry), not 1d |
| **C** | Deliberately ally-only mechanic, with no player-path counterpart | **Kept** (D4) |

A row that doesn't fit A/B/C is marked **"needs Tyler"** rather than
decided here.

Regenerate this file's content by hand after each step that changes
`pipeline.js`'s player/ally branches (1d onward) — there's no automated
scan for this one (unlike `tools/combat_field_ledger.js`), since "is this
mechanic present on both branches" isn't a mechanical grep, it's a
judgment call about what the code does.

## Kind B — player-only gear defenses (approved, Phase 2, not 1d)

| Mechanic | Lives in | Parity test |
|---|---|---|
| Reinforced (Divine Regalia — Forgeguard Buckler): every 3rd enemy attack on the player permanently grants +2 Defense | `chooseAction`, player branch, pipeline.js:104-109 | `P1C-NOREINFORCED-01` |
| Timeless Guard | `rollToHit`, player branch, pipeline.js:197-199 | bundled in `P1C-NOEVASION-01` |
| Guardian Spirit | `rollToHit`, player branch, pipeline.js:200-203 | bundled in `P1C-NOEVASION-01` |
| Guided Footsteps | `rollToHit`, player branch, pipeline.js:204-207 | bundled in `P1C-NOEVASION-01` |
| Never Where Expected | `rollToHit`, player branch, pipeline.js:208-210 | bundled in `P1C-NOEVASION-01` |
| Blessing of Freedom (Regalia of the Endless Horizon 2pc) | `rollToHit`, player branch, pipeline.js:211-213 | bundled in `P1C-NOEVASION-01` |
| Avatar of Freedom | `rollToHit`, player branch, pipeline.js:214-216 | bundled in `P1C-NOEVASION-01` |
| Evasion charges/turns (+ Evasive Guard's own bonus, + River Warden 6pc's bonus on a successful evasion) | `rollToHit`, player branch, pipeline.js:217-230 | bundled in `P1C-NOEVASION-01` |
| Mercy of the Veil: below 40% Health, once per combat, strips every status | `applyAndReact`, player branch, pipeline.js:516 (`checkMercyOfTheVeil`) | not independently tested — absent from the ally branch by construction (the function isn't called there at all), no dedicated "stays absent" scenario |

`P1C-NOEVASION-01` forces a miss-eligible roll and asserts none of the
bundled effects fire for an ally target; it doesn't distinguish which of
the seven would have fired individually. Good enough for "none of these
leak onto the ally path," not granular per-mechanic evidence.

## Kind A — enemy-side rules that today only fire against the player

| Mechanic | Enemy effect id | Lives in | Parity test |
|---|---|---|---|
| Marked Target: a successful hit marks the player (`combat.exposedTarget`); the NEXT attacker (any enemy) gets +8 Accuracy consuming the mark | `sang_cu_ie002_marked_target` | grant: `applyAndReact` player branch, pipeline.js:492-495; read/consume: `rollToHit` player branch, pipeline.js:173-177 | not independently tested — absent from the ally branch by construction (`combat.exposedTarget` is never read or set there), no dedicated "stays absent" scenario |
| Flowing Discipline (First Sword's Regalia 6pc): +10% damage once Barrier-banked, physical hits only | `dra_e07...` — see `flowingDisciplinePending` | `calculateDamage`, player branch, pipeline.js:372-376 | not independently tested |
| Winter's Verdict (First Sword's Regalia 8pc): +15% once, if the player is Chilled | — | `calculateDamage`, player branch, pipeline.js:377-380 | not independently tested |
| Toxic Preparation | `sang_iag_ie008_toxic_preparation` | `calculateDamage`, player branch, pipeline.js:385-388 | not independently tested |

These four are only asymmetric by omission (the ally branch simply never
checks them) — no test asserts they *stay* absent on the ally path the
way `P1C-NOREINFORCED-01`/`P1C-NOEVASION-01` do for the kind-B list.
Flagged here rather than silently assumed safe.

Stonewarden's physical-branch damage reduction (6pc, -25% on the first
hit taken each combat) is listed in `pipeline.js`'s own header as player-
only, but it isn't: it's the SAME `combat.firstHitTakenUsed` flag and the
SAME check, physically present in both the player's physical branch
(pipeline.js:381-384) and the magic branch (pipeline.js:337-340) — it's
just entirely absent from the ally branch (pipeline.js:250-293 has no
`firstHitTakenUsed` check at all, physical or magic). Corrected here:
this is real, but it's really "no defensive gear reduces an enemy's
first hit on an ally at all" (same shape as the kind-B list above, not a
kind-A enemy-side rule) — moved to the kind-B table's intent, tracked
here as its own line pending Tyler confirming which table it belongs in.

**needs Tyler**: Stonewarden 6pc above — is the ally-path absence of
"first hit taken this combat" mitigation a kind-B player-gear gap
(Phase 2, same as the rest of that table) or does Tyler want it folded
into U1 instead (since U1 already touches "how allies take element/
magic/matchup damage," and Stonewarden's check sits right next to
Unquenched Focus's inside the same magic branch)? Left undecided; don't
build either without an answer.

## U1/U2 — the ally path's missing elemental-damage branch

`calculateDamage`'s ally branch (pipeline.js:250-293) has **no magic/
elemental branch at all** — an enemy mage attacking an ally always uses
the flat physical formula (`effectiveEnemyAtk`'s own magic-fallback keeps
the number sane, but there's no element, no matchup multiplier, no
Adaptive Ward/Spell Ward/Storm Barrier interaction, nothing). This isn't
"kind A" (no single enemy-side rule is being skipped) — it's a structural
gap the whole magic branch's worth of mechanics sits behind. **U1**
(§2 of this handoff) is exactly this: allies take element/magic/matchup
damage the same way the player does, behind its own switch, default off.

**Unquenched Focus** (DRA-E07, `dra_e07_unquenched_focus`, pipeline.js:
321-324): Dregnar's first successful elemental attack each combat deals
1.10x. It's gated by the magic branch only existing on the player path,
so it can never fire against an ally today — not because of its own
logic, but purely because U1's gap means there's no elemental hit on an
ally to trigger off of. **U2** is this one specifically: once U1 exists,
wire Unquenched Focus to the ally-hit case too. Approved by Tyler, 9 Nov,
alongside U1 — see §2.

## Kind C — deliberately ally-only (kept, D4)

| Mechanic | Lives in | Parity test |
|---|---|---|
| Hadrian's Ally Protection (Legion's Memory / Brothers in Arms) | `applyAndReact`, ally branch, pipeline.js:426-427 (`maybeHadrianAllyProtection`) | exercised via `ally_protection_ledger.js` (real-kit coverage), not a dedicated phase1_step1c forced-roll scenario — see step 1c's own report for why |
| Generalized Ally Protection Reaction | `applyAndReact`, ally branch, pipeline.js:428-429 (`applyAllyProtectionReaction`) | same as above |
| Companion damage mitigation | `applyAndReact`, ally branch, pipeline.js:430-431 (`applyCompanionDamageTaken`) | same as above |
| Last Bastion retaliation | `applyAndReact`, ally branch, pipeline.js:448 (`maybeCompanionRetaliate`) | same as above |
| A miss on an ally provokes a free Riposte **from that ally onto the attacker**, inline, right inside the miss branch | `rollToHit`, ally branch, pipeline.js:164-168 (`riposteCounterByAllyOnEnemy`) | `P1C-MISS-01` |

The last row needs a caveat, not a flat "ally-only, no player
equivalent": the player's OWN Riposte gear effect (`maybeRiposte`,
combat.js:5296) exists and fires on a miss too — it's just wired at a
completely different layer (an external call at combat.js's own call
sites, gated on `retaliation.damage === 0`, covering a miss AND every
other way the enemy's attack dealt zero damage: Timeless Guard, Decoy,
a stunned no-op before D1, etc.) rather than inline inside `rollToHit`
the way the ally version is. Because the ally branch has none of those
other zero-damage mechanics (it's all kind B, player-only), a miss is
the ONLY way an ally-targeted attack ever reaches zero damage today — so
in practice the two Riposte wirings cover the same ground for now, but
only because of the kind-B gap above. If any kind-B mechanic is ever
extended to allies (Phase 2) without also teaching `applyDodgeBlockNegateBonuses`/
`maybeRiposte`'s outer call sites to recognize an ally-targeted zero-
damage result (today gated on the OUTER `retaliation.damage === 0` check,
which is structurally impossible for an ally target since `applyAndReact`'s
ally branch always returns `damage: null`, never `0` — see
`js/engine/combat.js`'s D1 commit for why that sentinel value matters),
Riposte-via-`maybeRiposte` would silently stay player-only even after the
gear itself went symmetric. **needs Tyler** if/when that day comes; not
an issue today since nothing kind-B is built yet.

## Not yet classified — found while building this register, not part of step 1c's own list

None at this time. Everything above traces to `pipeline.js`'s own step
1c header comment plus a line-by-line re-read of all three functions'
player/ally branches while building this file. A later step that finds
something new appends a row here (or to the right table above) rather
than silently fixing or silently preserving it.
