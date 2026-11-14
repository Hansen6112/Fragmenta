# Fragmenta: Combat Rebuild Phase 2, The Modifier Registry: Spec v1.0

**Status:** decided (Tyler, 13 Nov) -- all six §2 decisions ruled, all per the stated recommendation. Step 2a follows.
**Branch:** `claude/playable-game-world-2z7goo`, checked at `99ea225` (Damage Types step 4 closed; 550/550 tests; audit 0 errors).
**Builds on:** the Combat Rebuild Plan ("Modifiers are inline code with no ceiling"; "Keep vs tear down"), Phase 1 spec v1.0 (pipeline, `stat()`, combatant stores), the asymmetry register (`tools/combat_asymmetry_register.md`, kinds B and D), Damage Types spec v1.0 (T11: unique injury mechanics wait for this).
**Naming:** this is **Rebuild Phase 2**. Rebuild Phase 4 (budgets) depends on it.

---

## 1. The problem, measured at 99ea225

| What | Count today | Why it matters |
|---|---|---|
| Inline `hasEffect(...)` checks | **218** (131 in `combat.js`, 57 in `pipeline.js`, 21 in `actions.js`, 9 elsewhere) | Every gear effect is hand-placed code at its point of use. A new item effect means new engine code |
| Inline `hasSetTier(...)` checks | **75** | The same for the 82 named set bonuses |
| Damage multipliers on the player's physical hit | **22, multiplied together, no cap** (`rollPlayerDamageCoreForPipeline`) | Nothing limits how high the product climbs. An example stack that's legal today (Execution Protocol ×2, Temporal Echo ×2, Kingslayer ×1.25, a crit ×1.5, Momentum at 5 stacks ×1.5, Tempered Steel at 15 stacks ×1.3, Threads of Consequence ×1.4) gives **×20.5** |
| Effects that work only for the player | Kind B (9 defensive effects) and kind D (Opening Reach and Executioner on Hadrian's kit) | Allies equip real gear from the shared inventory, but almost none of its effects work for them. Tyler approved fixing this (D3, 9 Nov) and parked it here |
| Enemies wearing gear that has effects | **75 of 233 creatures**, 63 distinct effects | Only the effects someone hand-wired for creatures (52 checks) work. The rest are silent |
| Enemy passives | 169, dispatched through **64 trigger types** | Already data-driven. This is the closest thing to a registry the game has, and it's the template |

**What Phase 2 delivers:** every in-combat effect (gear, set bonus, enemy passive, status stat penalty) becomes **one data entry** in a registry. The entry says which pipeline step it hooks, which bucket it adds to, and who can hold it. The engine looks up a fighter's modifiers from whatever that fighter has equipped or carries. Then:
- A rule written once works for the player, allies and enemies alike, the same promise Phase 1 made for actions.
- Damage multipliers **add inside a bucket and multiply across buckets, with a cap per bucket**, so ten bonuses can't compound into a one-shot.
- A new item effect, set bonus or (later) Player Skill is a data entry, not engine code.

---

## 2. Decisions (Tyler, 13 Nov -- all ruled as recommended)

| # | Question | Ruling |
|---|---|---|
| **P2-1** | **Bucket math.** Add inside a bucket, multiply across buckets, a cap per bucket (the plan's own wording). | **Yes.** Phase 2 builds the mechanism; §4's cap *values* are provisional and Phase 4 tunes them |
| **P2-2** | **Ally gear effects work** (kind B and D), **including set bonuses**. | **Yes, including sets.** No second class of player-only gear |
| **P2-3** | **Enemies get their worn gear's combat effects.** | **Yes**, behind its own switch (R2), measured. Feeds Phase 4's per-enemy power budget |
| **P2-4** | **Stonewarden 6pc**: kind B gap or U1 item? | **Kind B.** The registry makes it work for whoever wears it. Register question closed |
| **P2-5** | **Riposte for allies** on any zero-damage result. | **Yes.** Fixed inside step 2e, not left as a known gap |
| **P2-6** | **Scope of "every effect".** | **Confirmed as written.** In: gear effects, set bonuses, enemy passives, status stat penalties. Out: non-combat effects, status damage ticks (already data), boss phases (Phase 3), cap tuning/budgets (Phase 4), new content |
| **P2-7** | **Pre-existing dead content.** The 2a catalogue (`tools/modifier_catalogue.md`) found 6 EFFECT_DEFS ids and 40 set-bonus tiers registered with **no live call site anywhere** -- unlike effects that honestly self-describe as "Currently inert," these just silently do nothing. Implement them for the first time as part of 2b-2g, or leave them dead and defer to a separate content pass? | **Leave dead, defer.** Matches §5's byte-identical/"move first, change later" principle -- Phase 2 restructures EXISTING behavior, not new content. `tools/audit.js`'s M1 deferral list (`M1_DEFERRED_EFFECT_IDS`/`M1_DEFERRED_SET_TIERS`) tracks the exact list so it stays visible as a backlog item, not a migration gap |

---

## 3. The modifier entry

```js
// js/data/modifiers.js (new): one entry per in-combat effect
MODIFIERS["effect:executioner"] = {
  source: { kind: "effect", id: "executioner" },     // effect | set | passive | status | item | skill (later)
  hook: "calculateDamage.outgoing",                   // see the hook list below
  bucket: "conditional",                              // required for damage and defense multipliers (§4)
  value: 0.20,                                        // additive inside the bucket (+20%)
  when: (ctx) => ctx.target.hpPct <= 0.30,            // optional condition; pure, reads only ctx
  holders: ["player"],                                // who it works for TODAY; switches widen it (§5)
  state: null,                                        // per-fight state it owns, if any: { stacks: 0 }, reset at fight start
  notes: "Executioner. Rule unchanged from EFFECT_DEFS."
};
```

**Sources, and how a fighter's list of modifiers is built** (`modifiersFor(combatant)`):
- **effect**: an id in the `effects` of any item the fighter has equipped (player, ally or enemy; `hasEffect` already reads any holder's `equipment`).
- **set**: a set tier the fighter meets (`hasSetTier` already counts any holder's pieces).
- **passive**: an entry in a creature's `passives` (the 64 trigger types become hooks; most map one to one).
- **status**: an active status's stat penalty (Chilled's Agility -10 and so on).
- **item**: a named-item rule with no effect id (Hadrian's Roll of the Ferratum, Astra Sa'Lahru's Broken Crest). These keep `holders: ["hadrian"]`, because they're lore rules, not generic gear.
- **skill**: reserved for Player Skills. Nothing is authored in Phase 2. This is how the shared skill resolver and the registry become "the same piece of code, built once" (the plan's last decision).

**Hooks** (the five pipeline steps, plus fight-lifecycle events):
`stat.<key>` (flat and percent) · `chooseAction` · `chooseTargets` · `rollToHit.attacker` / `rollToHit.defender` · `calculateDamage.outgoing` / `.defenseIgnore` / `.incoming` · `applyAndReact.onHitDealt` / `.onHitTaken` / `.onMiss` / `.onZeroDamage` / `.onKill` / `.onDowned` / `.onStatusApplied` · `fight.start` / `round.start` / `turn.start` / `fight.end` · `cheatDeath`.

**Rules carried over from Phase 1:**
- `when` and `value` functions are **pure**. Spending a one-shot (a charge, an "once per fight" flag) happens only in `applyAndReact`, through the entry's declared `state`. That's the `stat()` purity rule, extended.
- Entries change HP only through `applyAndReact` / `applyHealing` (audit rule P1 still applies).
- No checks on action or ally identity inside an entry (P4 still applies). An entry that needs "only on Feint" uses the action's data tags (`actionType`, `trackingKey`), not its id.

---

## 4. Buckets and provisional caps (P2-1)

**Outgoing damage.** Values add inside a bucket, then the buckets multiply together.

| Bucket | Today's members (catalogue in 2a completes the list) | Provisional cap |
|---|---|---|
| **conditional**: the target or timing qualifies | Executioner +20%, Dragonslayer +20%, Bleed Exploitation +20%, Kingslayer +25/+50%, Hunter's Instinct +30/+60%, Crushing Impact, Master Craftsman +20%, Stone's Patience +30%, Blessing of Valor +30%, Opening Reach +15% | **+100%** |
| **stacking**: builds over the fight | Momentum ≤+50%, Momentum Unbound ≤+30%, Tempered Steel ≤+30%, Worthy Challenge ≤+50% | **+75%** |
| **burst**: every Nth hit, or a primed strike | Execution Protocol +100/+200%, Temporal Echo +100/+200%, Echoing Arsenal +100%, Threads of Consequence +40%, Arcane Overflow +50/+100%, Avatar of Time +25% | **+150%** |
| **crit** | Crit ×1.5, or ×2.0 under Avatar of Fate | its own value (a single source) |
| **variance**: random both ways | Loaded Dice ×0.5/×2.0, Avatar of Chaos ×0.75-1.75 | **none.** They stay as a product. They swing both ways, and capping only the top would make them a net loss |

**Defense ignore** (lowers the target's effective Defense): Foreseen Strike -50%, Commanding Presence -100%, Precision Formula -30%, Armor Crack (flat). They add together, capped at **-100%** (Defense can't go below 0).

**Incoming damage** (the defender's mitigation): Spell Ward, Stonewarden 6pc, Storm Barrier, creature `dmgReduction`, the Sanguivorum mitigation chain (`sangCuDefenderMitigation` and its three siblings), Thick Hide and the other `flatDamageReduction` passives. They add together, capped at **60% reduction** (so damage never falls below ×0.4). **Damage-type tags are not part of this.** They're their own multiplier (Damage Types T2), applied after it.

**What the example stack becomes:** ×20.5 today, **×8.2 bucketed** (conditional +25% -> ×1.25; stacking +80% capped at +75% -> ×1.75; burst +240% capped at +150% -> ×2.5; crit ×1.5). It's still a big hit, but no longer a one-shot.

**Stat modifiers** (`stat.<key>`): flat amounts add, then percentages add, then they apply. **No caps in Phase 2.** The 2a catalogue lists every stat source, and the caps go on the Phase 4 list.

---

## 5. Parity, then four switches

Phase 1's rule applies: **move first, change later.** Every migrated entry starts with `holders` set to exactly who it works for today, and the damage combination stays the old uncapped product. So the migration is **byte-identical**. Behaviour changes only arrive through switches, one at a time, each measured.

| Switch | What it turns on | Decision |
|---|---|---|
| `MOD_REGISTRY` R0 | Nothing: the registry runs, with `holders` as today and the legacy product | none needed (parity) |
| **R1** | Party holders: `holders` widen to the player **and allies** for every kind B and kind D entry and every set bonus | P2-2 |
| **R2** | Enemy holders: worn-gear combat effects work on the creatures wearing them | P2-3 |
| **R3** | Bucketed combination with the §4 caps replaces the uncapped product | P2-1 |

R1, R2 and R3 are each flipped alone, with before/after results from both harnesses (`tools/sim/`) at N=1000 for all five classes. **Any cell that moves more than 10 points goes to Tyler**, new or old cells (the rule from damage types step 4). R3 needs one extra measurement the harness can't see, because it only uses basic attacks: report the **largest single hit** per class with and without R3, using the 2a catalogue's worst-case stacks as forced test cases.

---

## 6. Steps

| Step | Work | Done when |
|---|---|---|
| **2a. Catalogue and skeleton** | (1) A **catalogue** (`tools/modifier_catalogue.md`) of every `hasEffect` / `hasSetTier` / passive trigger / named-item check in combat code: source, current hook point, kind (multiplier, flat stat, reaction, state), who it works for today, and a proposed bucket. Also the worst-case stack per bucket today. (2) `modifiers.js`, `modifiersFor(combatant)`, the hook dispatcher, and audit rules M1-M5 as **warnings**. No migrations yet | The catalogue reaches Tyler and me; we confirm the bucket assignments before 2b |
| **2b. Stat modifiers** | `stat()`'s internals read the registry (flat and percent stat sources, including set flat bonuses during a fight and status stat penalties) | Byte-identical |
| **2c. rollToHit** | Accuracy and evasion: the 9 kind B evasion and defense effects, Marked Target, and the like | Byte-identical |
| **2d. calculateDamage** | Outgoing, defense-ignore and incoming multipliers as bucketed entries, **combined by the legacy product** while R3 is off | Byte-identical |
| **2e. applyAndReact and the fight lifecycle** | On-hit, on-taken, on-miss, on-zero-damage (P2-5), on-kill, cheat-deaths (Elder Bark, Last Stand), fight and round events. The ~41 set and gear fields moved in 1g-v become **entry-declared `state`**, reset by the registry at fight start | Byte-identical; the field ledger shows no undeclared fight fields left for these effects |
| **2f. Enemy passives** | The 64 trigger types become hooks; each passive is a registry entry | Byte-identical |
| **2g. Close-out** | Zero `hasEffect` / `hasSetTier` calls left in combat code (M2 becomes an error). **Test-strike proof:** one new gear effect and one new set bonus, written **as data only**, working for a player, an ally and an enemy holder (with R1 and R2 forced on in the test). Then flip R1, R2, R3 in that order, one at a time, each with its report | Switches decided by Tyler; `post_phase2_baseline_<commit>.json` recorded in `tools/baselines/` |

Every step: suite green, audit 0 errors, switch-off harness output byte-identical to the step before.

---

## 7. Audit rules (`tools/audit.js`)

- **M1:** every combat-relevant `EFFECT_DEFS` id and every named set bonus has a registry entry, or is marked `inert` (no live trigger; 47 effect descriptions say "Currently inert" today) or `outOfCombat`, with a reason.
- **M2:** no `hasEffect` / `hasSetTier` calls in `pipeline.js`, `actions.js` or the combat functions of `combat.js`. Non-combat files are allowlisted by name.
- **M3:** every entry declares `hook` and `holders`. Every multiplier entry declares a `bucket`. Every fight field an entry writes is in its own `state` (cross-checked with `combat_field_ledger.js`).
- **M4:** every bucket has a cap entry (or is explicitly uncapped, like `variance`). Nothing multiplies damage outside a bucket, except damage-type tags and an action's own `dmgMult`.
- **M5:** `when` and `value` functions don't write state (checked by a frozen-context test run over every entry).

---

## 8. What this unlocks
- **Unique injury mechanics** (Damage Types T11): an injury becomes a `status`-style source with its own entry. No engine code.
- **Player Skills:** a skill is a `skill` source plus an action definition (`usePlayerAction`). That's the shared resolver the Player Skills chat planned.
- **Rebuild Phase 4:** the budget can price a kit, because every passive and worn effect now has a hook, a bucket and a value it can read. The cap list it needs is the §4 table.

**Next:** write the 2a handoff (catalogue + skeleton), now that all six decisions are ruled.
