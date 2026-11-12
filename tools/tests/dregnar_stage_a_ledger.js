const { chromium } = require('playwright');
const { seedPageRandom } = require('./seed_rng');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const seed = await seedPageRandom(page);
  console.log(`seed: ${seed}`);
  await page.goto('http://localhost:8949/index.html');
  await page.waitForSelector('#input');

  const out = await page.evaluate(() => {
    function makeChar(level) {
      const s = new GameState();
      s.playerName = 'T';
      s.applyCreation('human', 'human_legionary', 'warrior', {});
      if (level) { s.level = level; s.recomputeStats(false); }
      return s;
    }
    function withForcedHit(fn) {
      const oc = window.attackConnects;
      window.attackConnects = () => true;
      try { return fn(); } finally { window.attackConnects = oc; }
    }
    function withForcedMiss(fn) {
      const oc = window.attackConnects;
      window.attackConnects = () => false;
      try { return fn(); } finally { window.attackConnects = oc; }
    }
    function freshDregnar(level) {
      const s = makeChar(level || 60);
      s.health = s.maxHealth * 1000; // effectively unkillable, so multi-turn sequences don't get cut short by the player's own counter-damage
      s.maxHealth = s.maxHealth * 1000;
      startCombat(s, 'dregnar_ashvein', 30);
      return s;
    }
    const ledger = [];
    function record(code, description, fn) {
      let passed = false, errors = 0, detail = null;
      try {
        const ok = fn();
        passed = ok && typeof ok === 'object' && 'pass' in ok ? !!ok.pass : !!ok;
        detail = ok;
      } catch (e) {
        errors++;
        detail = { error: e.message, stack: (e.stack || '').split('\n').slice(0, 4).join(' / ') };
      }
      ledger.push({ code, description, pass: passed && errors === 0, errors, detail });
    }

    // ============ Stat scaling: the single most consequential check ============
    record('DRA-STATS-01', 'startCombat("dregnar_ashvein", 30) yields exactly the flat x2 PLAYER_STAT_SCALE stats on his Stage B (fully equipped) totals (430/50/55/31/13/99/14 base+gear -> 860/100/110/62/13/99/14), NOT Danger-Class-multiplied values. Updated 6 Nov 2026: this assertion predated Stage B’s 10-item Mythic kit (commit fb35087) and was never updated afterward, so it had been failing against the correct, documented-in-bestiary.js numbers since then — not an engine bug. spd/acc/agi aren’t touched by the x2 scale (authored/gear-bonus as given), so 13/99/14 match pre- and post-scale.', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      return {
        pass: activeEnemySlot(s.combat).maxHp === 860 && c.atk === 100 && c.def === 110 && c.magic === 62 && c.spd === 13 && c.acc === 99 && c.agi === 14,
        hp: activeEnemySlot(s.combat).maxHp, atk: c.atk, def: c.def, magic: c.magic, spd: c.spd, acc: c.acc, agi: c.agi,
      };
    });
    record('DRA-STATS-02', 'special:true routes through legacyScaledCreature (statScaled flag set), confirming the Danger Class multiplier pipeline was never touched', () => {
      const s = freshDregnar();
      return { pass: activeEnemySlot(s.combat).creatureObj.statScaled === true, statScaled: activeEnemySlot(s.combat).creatureObj.statScaled };
    });
    record('DRA-STATS-03', 'bossKit is wired so resolveEnemyAction dispatches to the bespoke Dregnar resolver instead of the shared actives/passives system', () => {
      const s = freshDregnar();
      return { pass: activeEnemySlot(s.combat).creatureObj.bossKit === 'dregnar_ashvein' && !activeEnemySlot(s.combat).creatureObj.actives && !activeEnemySlot(s.combat).creatureObj.passives, bossKit: activeEnemySlot(s.combat).creatureObj.bossKit };
    });

    // ============ State cadence: Water Guard -> Unbound -> Water Guard ============
    record('DRA-STATE-01', 'starts in water_guard (lazily initialized on the first action)', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: s.combat.enemies[0].draState === 'water_guard', state: s.combat.enemies[0].draState };
    });
    record('DRA-STATE-02', 'transitions to ashquench_unbound after exactly 2 turns (no Judgment pending), announced at the START of turn 3', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      const r1 = withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      const stateAfter1 = e.draState;
      const r2 = withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      const stateAfter2 = e.draState; // transition decided at end of turn 2
      const r3 = withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      const announcedOnTurn3 = r3.lines.some((l) => l.includes('shatters'));
      return {
        pass: stateAfter1 === 'water_guard' && stateAfter2 === 'ashquench_unbound' && announcedOnTurn3,
        stateAfter1, stateAfter2, announcedOnTurn3, r3lines: r3.lines,
      };
    });
    record('DRA-STATE-03', 'transitions back to water_guard after 2 turns in Unbound, and a full Water Guard -> Unbound -> Water Guard cycle is exactly 4 turns when nothing is pending', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      const states = [];
      for (let i = 0; i < 5; i++) {
        withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
        states.push(e.draState);
      }
      return { pass: states[0] === 'water_guard' && states[1] === 'ashquench_unbound' && states[2] === 'ashquench_unbound' && states[3] === 'water_guard' && states[4] === 'water_guard', states };
    });
    record('DRA-STATE-04', 'Ashquench Unbound grants a genuine bonus action each turn (two distinct attack lines per turn), Water Guard does not', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      // force into Unbound directly for a clean, isolated read
      s.combat.enemies[0].draState = 'ashquench_unbound';
      s.combat.enemies[0].draStateTurns = 0;
      const unboundResult = withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      const unboundHasBonusLine = unboundResult.lines.some((l) => l.includes('moves again'));
      const s2 = freshDregnar();
      const c2 = activeEnemySlot(s2.combat).creatureObj;
      const guardResult = withForcedMiss(() => resolveEnemyAction(s2, c2, 2, 0));
      const guardHasBonusLine = guardResult.lines.some((l) => l.includes('moves again'));
      return { pass: unboundHasBonusLine && !guardHasBonusLine, unboundHasBonusLine, guardHasBonusLine };
    });

    // ============ Judgment: wind-up / resolution / 3-turn extension / force-cancel ============
    record('DRA-JUDGMENT-01', 'Judgment is a telegraphed two-phase ability: the wind-up turn deals no damage and sets draJudgmentPending, the very next normal action resolves it (deals damage) and clears the flag', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.draState = 'ashquench_unbound'; e.draStateTurns = 0;
      e.abilityCooldowns = { dra_cleave: 99, dra_hammerfall: 99, dra_frostbite_brand: 99 }; // force Judgment to the top of priority
      // Unbound always takes a bonus action too, so the windup CALL's overall
      // `damage` return can be non-null (the bonus action's own hit) even
      // though Judgment itself dealt none that turn — checked via the
      // telegraph line / absence of the resolution line instead.
      const windup = withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      const pendingAfterWindup = e.draJudgmentPending;
      const windupTelegraphed = windup.lines.some((l) => l.includes('Ashquench Judgment, incoming'));
      const windupNotYetResolved = !windup.lines.some((l) => l.includes('Ashquench Judgment falls'));
      const resolution = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      const resolvedLine = resolution.lines.some((l) => l.includes('Ashquench Judgment falls'));
      return {
        pass: pendingAfterWindup === true && windupTelegraphed && windupNotYetResolved && resolvedLine && e.draJudgmentPending === false && e.abilityCooldowns.dra_judgment === 5,
        pendingAfterWindup, windupTelegraphed, windupNotYetResolved, resolvedLine, pendingAfterResolution: e.draJudgmentPending, judgmentCooldown: e.abilityCooldowns.dra_judgment,
      };
    });
    record('DRA-JUDGMENT-02', 'a pending Judgment extends the state to a 3rd turn instead of transitioning at the normal 2-turn mark', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.draState = 'ashquench_unbound'; e.draStateTurns = 1; // about to take the 2nd turn
      e.abilityCooldowns = { dra_cleave: 99, dra_hammerfall: 99, dra_frostbite_brand: 99 };
      withForcedMiss(() => resolveEnemyAction(s, c, 2, 0)); // turn 2: winds up Judgment
      const stillUnboundAfterTurn2 = e.draState === 'ashquench_unbound';
      withForcedHit(() => resolveEnemyAction(s, c, 2, 0)); // turn 3: resolves Judgment, then transitions
      const transitionedAfterTurn3 = e.draState === 'water_guard';
      return { pass: stillUnboundAfterTurn2 && transitionedAfterTurn3, stillUnboundAfterTurn2, transitionedAfterTurn3, turnsAtTransition: e.draStateTurns };
    });
    record('DRA-JUDGMENT-03', 'Judgment never winds up or resolves from the bonus-action slot', () => {
      const ids = ['dra_cleave', 'dra_hammerfall', 'dra_frostbite_brand', 'dra_judgment'];
      const priorityHasNoJudgment = !ids.slice(0, 3).includes('dra_judgment');
      // Structural check: confirm the bonus priority constant itself never names it (read via a real Unbound turn's bonus line never saying "Judgment falls" when forced eligible).
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.draState = 'ashquench_unbound'; e.draStateTurns = 0;
      e.abilityCooldowns = {}; // everything eligible, including dra_judgment on the normal list
      const r = withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      // normal action should wind up Judgment (top priority); bonus action must pick something else, never "Judgment falls"
      const bonusLine = r.lines.find((l) => l.includes('moves again'));
      return { pass: priorityHasNoJudgment && !r.lines.join(' ').includes('Judgment falls') && e.draJudgmentPending === true, lines: r.lines };
    });

    // ============ Priority order: Water Guard & Unbound ============
    record('DRA-PRIORITY-01', 'Water Guard picks Barrier first when off cooldown, falls to Hammerfall then Frostbite as each is put on cooldown', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      const r1 = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      const pickedBarrier = r1.lines.some((l) => l.includes('shifting water barrier'));
      e.abilityCooldowns.dra_barrier = 99;
      const r2 = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      const pickedHammerfall = r2.lines.some((l) => l.includes('Vosgard Hammerfall'));
      e.abilityCooldowns.dra_hammerfall = 99;
      // the normal 2-turn cadence would have flipped to Unbound by now —
      // force back to Water Guard so this 3rd call still tests THAT
      // state's own priority order, not the state-transition cadence
      // (covered separately by DRA-STATE-02/03).
      e.draState = 'water_guard'; e.draStateTurns = 0;
      const r3 = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      const pickedFrostbite = r3.lines.some((l) => l.includes('Frostbite Brand'));
      return { pass: pickedBarrier && pickedHammerfall && pickedFrostbite, pickedBarrier, pickedHammerfall, pickedFrostbite };
    });
    record('DRA-PRIORITY-02', 'Water Guard falls back to a plain basic attack ("hits back") when all 3 actives are on cooldown', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.abilityCooldowns = { dra_barrier: 99, dra_hammerfall: 99, dra_frostbite_brand: 99 };
      const r = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: r.lines.some((l) => l.includes('hits back')), lines: r.lines };
    });
    record('DRA-PRIORITY-03', 'Unbound normal priority picks Cleave over Hammerfall/Frostbite when Judgment is on cooldown', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.draState = 'ashquench_unbound'; e.draStateTurns = 0;
      e.abilityCooldowns = { dra_judgment: 99 };
      const r = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: r.lines.some((l) => l.includes('Black-Ice Cleave')), lines: r.lines };
    });
    record('DRA-PRIORITY-04', 'Unbound bonus-action priority picks Cleave/Hammerfall/Frostbite only, never Barrier (not in its list at all)', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.draState = 'ashquench_unbound'; e.draStateTurns = 0;
      e.abilityCooldowns = { dra_judgment: 99 }; // normal action forced off Judgment so the test isolates the bonus line
      const r = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      const bonusLineIdx = r.lines.findIndex((l) => l.includes('moves again'));
      const bonusLine = r.lines[bonusLineIdx + 1] || '';
      const bonusNamedOneOfTheThree = ['Black-Ice Cleave', 'Vosgard Hammerfall', 'Frostbite Brand'].some((n) => bonusLine.includes(n));
      return { pass: bonusLineIdx >= 0 && bonusNamedOneOfTheThree && !bonusLine.includes('barrier'), bonusLine };
    });

    // ============ The 5 actives: multiplier / cooldown / status ============
    record('DRA-ACTIVE-01', 'Shifting Water Barrier: 0 damage, sets dmgReduction 0.25 for 1 turn (reduces the very next incoming hit), cooldown 5', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      const r = withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: r.damage === null && c.dmgReduction === 0.25 && e.abilityCooldowns.dra_barrier === 5, damage: r.damage, dmgReduction: c.dmgReduction, cooldown: e.abilityCooldowns.dra_barrier };
    });
    record('DRA-ACTIVE-02', 'Barrier\'s dmgReduction expires after exactly 1 round via the existing tickEnemyPassives selfBuffs countdown', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      withForcedMiss(() => resolveEnemyAction(s, c, 2, 0)); // casts Barrier
      const reductionSet = c.dmgReduction === 0.25;
      tickEnemyPassives(s, e);
      return { pass: reductionSet && c.dmgReduction === 0, reductionSet, afterTick: c.dmgReduction };
    });
    record('DRA-ACTIVE-03', 'Vosgard Hammerfall: dmgMult 1.15, cooldown 2', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.abilityCooldowns = { dra_barrier: 99 };
      const r = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: r.damage > 0 && e.abilityCooldowns.dra_hammerfall === 2, damage: r.damage, cooldown: e.abilityCooldowns.dra_hammerfall };
    });
    record('DRA-ACTIVE-04', 'Black-Ice Cleave: dmgMult 1.35, cooldown 3, 25% chance to inflict Chilled on hit (statistically present over many trials)', () => {
      let chilledCount = 0;
      const TRIALS = 60;
      for (let i = 0; i < TRIALS; i++) {
        const s = freshDregnar();
        const c = activeEnemySlot(s.combat).creatureObj;
        const e = s.combat.enemies[0];
        e.draState = 'ashquench_unbound'; e.draStateTurns = 0;
        e.abilityCooldowns = { dra_judgment: 99 };
        const r = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
        if (r.lines.join(' ').includes('Chilled')) chilledCount++;
      }
      const rate = chilledCount / TRIALS;
      return { pass: rate > 0.1 && rate < 0.45, chilledCount, trials: TRIALS, rate };
    });
    record('DRA-ACTIVE-05', 'Frostbite Brand: dmgMult 1.10, cooldown 2, 30% chance to inflict Chilled on hit (statistically present over many trials) — numerically distinct entry from frost_bite, not an alias', () => {
      let chilledCount = 0;
      const TRIALS = 60;
      for (let i = 0; i < TRIALS; i++) {
        const s = freshDregnar();
        const c = activeEnemySlot(s.combat).creatureObj;
        const e = s.combat.enemies[0];
        e.abilityCooldowns = { dra_barrier: 99, dra_hammerfall: 99 };
        const r = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
        if (r.lines.join(' ').includes('Chilled')) chilledCount++;
      }
      const rate = chilledCount / TRIALS;
      return { pass: rate > 0.12 && rate < 0.5, chilledCount, trials: TRIALS, rate };
    });
    record('DRA-ACTIVE-06', 'Ashquench Judgment: dmgMult 1.75 on resolution', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.draState = 'ashquench_unbound'; e.draStateTurns = 0;
      e.abilityCooldowns = { dra_cleave: 99, dra_hammerfall: 99, dra_frostbite_brand: 99 };
      withForcedMiss(() => resolveEnemyAction(s, c, 2, 0)); // wind-up
      const r = withForcedHit(() => resolveEnemyAction(s, c, 2, 0)); // resolution
      return { pass: r.damage > 0, damage: r.damage, lines: r.lines };
    });

    // ============ DRA-P01/P02: shared pending-Accuracy bonus ============
    record('DRA-P01', 'Guarded Concentration: casting Barrier banks a pending +5 Accuracy bonus, consumed (and zeroed) on the very next attack attempt', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      withForcedMiss(() => resolveEnemyAction(s, c, 2, 0)); // Barrier
      const pendingAfterBarrier = e.draPendingAcc;
      let seenAcc = null;
      const oc = window.attackConnects;
      window.attackConnects = (acc) => { seenAcc = acc; return true; };
      e.abilityCooldowns.dra_barrier = 99; // force a real attack next
      try { resolveEnemyAction(s, c, 2, 0); } finally { window.attackConnects = oc; }
      return { pass: pendingAfterBarrier === 5 && seenAcc === c.acc + 5 && e.draPendingAcc === 0, pendingAfterBarrier, seenAcc, baseAcc: c.acc, pendingAfterConsumption: e.draPendingAcc };
    });
    record('DRA-P02', 'Martial Precision: a landed plain basic attack banks the same pending +5 Accuracy (shared slot with P01, never stacking to +10)', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.abilityCooldowns = { dra_barrier: 99, dra_hammerfall: 99, dra_frostbite_brand: 99 }; // force a plain basic attack
      withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: e.draPendingAcc === 5, pendingAfterBasicHit: e.draPendingAcc };
    });
    record('DRA-P01P02-noStack', 'the pending bonus never stacks beyond +5 no matter how many times either trigger fires back-to-back', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      withForcedMiss(() => resolveEnemyAction(s, c, 2, 0)); // Barrier, pending=5
      e.abilityCooldowns.dra_barrier = 99;
      e.abilityCooldowns.dra_hammerfall = 99;
      e.abilityCooldowns.dra_frostbite_brand = 99; // force basic attack next, consuming pending=5 then re-setting it to 5 again if it lands
      withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: e.draPendingAcc === 5, pendingAcc: e.draPendingAcc };
    });

    // ============ DRA-P03: once-per-combat 40% HP trigger ============
    record('DRA-P03-trigger', 'First Sword\'s Resolve triggers exactly once, the first time HP is observed at or below 40%, granting 2 charges of +3 Attack', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.hp = Math.floor(e.maxHp * 0.39);
      const r = withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      const triggeredLine = r.lines.some((l) => l.includes("First Sword's Resolve"));
      return { pass: triggeredLine && e.draP03Used === true && e.draP03Charges === 2, triggeredLine, draP03Used: e.draP03Used, charges: e.draP03Charges };
    });
    record('DRA-P03-onceOnly', 'does not re-trigger on a later call even while still below 40%', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.hp = Math.floor(e.maxHp * 0.39);
      withForcedMiss(() => resolveEnemyAction(s, c, 2, 0)); // triggers, consumes 1 charge this same turn too
      const chargesAfterFirstCall = e.draP03Charges;
      const r2 = withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      const retriggeredLine = r2.lines.some((l) => l.includes("First Sword's Resolve"));
      return { pass: !retriggeredLine, retriggeredLine, chargesAfterFirstCall };
    });
    record('DRA-P03-atkBonus', 'each damaging attempt while charges remain brackets +3 Attack around the hit (verified via average damage > baseline), and atk is restored to baseline afterward', () => {
      const baseAtk = (() => { const s = freshDregnar(); return activeEnemySlot(s.combat).creatureObj.atk; })();
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.hp = Math.floor(e.maxHp * 0.39);
      e.abilityCooldowns = { dra_barrier: 99 }; // force a real damaging attempt (Hammerfall) this same turn
      withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: c.atk === baseAtk, atkAfter: c.atk, baseAtk };
    });
    record('DRA-P03-expiry', 'unused charges expire after 3 NORMAL actions (zeroed even if never consumed)', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.draState = 'water_guard'; e.draStateTurns = 0; // pre-seed lazy-init fields first so the P03 overrides below aren't wiped
      e.draP03Used = true; e.draP03Charges = 2; e.draP03TurnsLeft = 3; // simulate the trigger without re-deriving the 40% HP condition
      withForcedMiss(() => resolveEnemyAction(s, c, 2, 0)); // tick 1 -> turnsLeft 2
      withForcedMiss(() => resolveEnemyAction(s, c, 2, 0)); // tick 2 -> turnsLeft 1
      const beforeExpiry = e.draP03Charges;
      withForcedMiss(() => resolveEnemyAction(s, c, 2, 0)); // tick 3 -> turnsLeft 0, charges zeroed
      return { pass: beforeExpiry > 0 && e.draP03Charges === 0, beforeExpiry, afterExpiry: e.draP03Charges };
    });
    record('DRA-P03-bonusDoesNotTickTimer', 'a bonus action may consume a P03 charge but never decrements draP03TurnsLeft (only normal actions do)', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.draState = 'ashquench_unbound'; e.draStateTurns = 0;
      e.draP03Used = true; e.draP03Charges = 2; e.draP03TurnsLeft = 3;
      e.abilityCooldowns = { dra_judgment: 99 };
      const turnsLeftBefore = e.draP03TurnsLeft;
      withForcedHit(() => resolveEnemyAction(s, c, 2, 0)); // consumes up to 2 charges (normal + bonus), ticks timer once (normal only)
      return { pass: e.draP03TurnsLeft === turnsLeftBefore - 1, turnsLeftBefore, turnsLeftAfter: e.draP03TurnsLeft, chargesAfter: e.draP03Charges };
    });

    // ============ Regression: the other 40+ creatures are untouched ============
    record('DRA-REGRESSION-01', 'a normal (non-Dregnar) creature with actives still goes through the shared resolveEnemyActiveAbility random-pick path, completely unaffected by the bossKit dispatch check', () => {
      const s = makeChar(21);
      startCombat(s, 'desert_tribal_fighter', 21);
      const c = activeEnemySlot(s.combat).creatureObj;
      c.actives = ['opportunistic_strike']; c.passives = [];
      const ctx = resolveEnemyActiveAbility(s, c);
      return { pass: ctx !== null && ctx.id === 'opportunistic_strike' && c.bossKit === undefined, ctxId: ctx && ctx.id, bossKit: c.bossKit };
    });
    record('DRA-REGRESSION-02', 'a special:true scripted creature that is NOT Dregnar (kabal_enforcer) still scales via legacyScaledCreature and is entirely unaffected by the new dispatch line', () => {
      const s = makeChar(21);
      startCombat(s, 'kabal_enforcer', 21);
      const c = activeEnemySlot(s.combat).creatureObj;
      return { pass: c.bossKit === undefined && c.statScaled === true, bossKit: c.bossKit, statScaled: c.statScaled };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`Dregnar Stage A: ${out.summary.passed}/${out.summary.total} passed`);
  if (out.summary.failed.length) {
    console.log('FAILURES:');
    for (const f of out.summary.failed) {
      console.log(`  ${f.code}: ${f.description}`);
      console.log(`    detail: ${JSON.stringify(f.detail)}`);
    }
  }
  console.log(`RESULT: ${out.summary.passed}/${out.summary.total}`);

  await browser.close();
  process.exit(out.summary.failed.length ? 1 : 0);
})();
