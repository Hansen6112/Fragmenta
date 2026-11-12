// Step 1f-iii (reactions), handoff §4's own required proof: "a throwaway
// test reaction (for example 'on being missed, counter at ×0.5') added as
// data only. It fires through the pipeline with no step-function changes."
//
// test_half_counter is a test-only reaction -- its formula is registered
// into PIPELINE_FORMULAS at RUNTIME, inside this script's own
// page.evaluate, never written to any file on disk, so it never appears
// in the real game (same convention test_strike_proof_ledger.js already
// uses for a brand-new PLAYER_ACTION_DEFS entry). Its own orchestrator
// (testHalfCounterReaction, below) lives ONLY in this test file too --
// not one line is added to pipeline.js or combat.js. It calls the five
// pipeline step functions (chooseAction, chooseTargets, rollToHit,
// calculateDamage, applyAndReact) completely unchanged, exactly the way
// resolveRiposteCounterOnPlayer/resolveArenaRiposteCounterOnPlayer
// (pipeline.js, already shipped) call them for the real Riposte family --
// proving those five functions, as hardened for the Riposte family, are
// now generic over ANY new reaction shaped like one (toHit: "none",
// isReaction: true, a named PIPELINE_FORMULAS entry, a flavorLine), not
// specific to the handful of reactions actually shipped.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:8949/index.html');
  await page.waitForSelector('#input');

  const out = await page.evaluate(() => {
    const ledger = [];
    function record(code, description, fn) {
      let passed = false, errors = 0, detail = null;
      try {
        const ok = fn();
        passed = ok && typeof ok === 'object' && 'pass' in ok ? !!ok.pass : !!ok;
        detail = ok;
      } catch (e) {
        errors++;
        detail = { error: e.message, stack: (e.stack || '').split('\n').slice(0, 5).join(' / ') };
      }
      ledger.push({ code, description, pass: passed && errors === 0, errors, detail });
    }

    // Registered here, at runtime, in this test's own scope -- the ONLY
    // place test_half_counter's math exists. "On being missed, counter at
    // x0.5" (the handoff's own example): half of the countering creature's
    // Attack, mitigated by the player's Defense exactly like every other
    // physical hit (mitigate(), effectiveEnemyAtk(), effectivePlayerDef()
    // are all pre-existing shared helpers -- nothing new added for this).
    PIPELINE_FORMULAS.testHalfCounter = function (actor, target, action, ctx, hitInfo) {
      const state = ctx.state;
      const creature = actor.ref.creatureObj;
      const atk = effectiveEnemyAtk(state, creature);
      const playerDef = effectivePlayerDef(state);
      const edmg = Math.max(1, Math.round(mitigate(atk, playerDef) * 0.5));
      return { shortCircuit: false, edmg, kind: "physical" };
    };

    // The orchestrator: builds the combatant views (findEnemyCombatant,
    // makePlayerCombatant -- both already-shipped, generic, step-1a
    // helpers) and a plain action object, then calls the five pipeline
    // steps directly, in order -- the exact same shape
    // resolveArenaRiposteCounterOnPlayer uses, just written here instead
    // of in pipeline.js, to prove the steps themselves needed no change
    // to support it.
    function testHalfCounterReaction(state, creature) {
      const actor = findEnemyCombatant(state, creature);
      const target = makePlayerCombatant(state);
      const action = {
        formula: "testHalfCounter",
        toHit: "none", isReaction: true,
        flavorLine: (c, edmg) => `TEST REACTION: ${c.name} counters for ${edmg} (half-strength, data-only proof).`,
      };
      const ctx = { state, pendingAction: action, target };

      const chosen = chooseAction(actor, ctx);
      const targets = chooseTargets(actor, chosen, ctx);
      const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
      if (!hitInfo.hit) return hitInfo.result.lines;

      const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
      const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
      return result.lines;
    }

    function makeWarrior() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      s.combat.enemies[0].hp = 100000;
      s.combat.enemies[0].maxHp = 100000; // not attacked in this proof; kept alive as convention
      return s;
    }

    record('TESTREACTION-RUNS-FIVE-STEPS', 'test_half_counter fires through chooseAction -> chooseTargets -> rollToHit -> calculateDamage -> applyAndReact with zero changes to pipeline.js or combat.js beyond what the Riposte family already shipped', () => {
      const s = makeWarrior();
      const creature = s.combat.enemies[0].creatureObj;
      const hpBefore = s.health;
      const lines = testHalfCounterReaction(s, creature);
      const hpAfter = s.health;
      const dealt = hpBefore - hpAfter;
      const hasFlavorLine = lines.some((l) => /TEST REACTION/.test(l));
      return { pass: dealt > 0 && hasFlavorLine, dealt, lines };
    });

    record('TESTREACTION-EXACT-MATH', 'the damage dealt matches testHalfCounter\'s own formula exactly (half of effectiveEnemyAtk, mitigated by effectivePlayerDef) -- confirming calculateDamage dispatched to the newly-registered formula by name, same mechanism as every other formula in the table', () => {
      const s = makeWarrior();
      const creature = s.combat.enemies[0].creatureObj;
      const atk = effectiveEnemyAtk(s, creature);
      const playerDef = effectivePlayerDef(s);
      const expected = Math.max(1, Math.round(mitigate(atk, playerDef) * 0.5));
      const hpBefore = s.health;
      testHalfCounterReaction(s, creature);
      const dealt = hpBefore - s.health;
      return { pass: dealt === expected, dealt, expected };
    });

    record('TESTREACTION-ALWAYS-HITS', 'toHit: "none" (added to rollToHit for the Riposte family) makes this new reaction unconditional, same as Arena Riposte -- no accuracy roll, no miss branch taken', () => {
      const origRandom = Math.random;
      Math.random = () => 0.999; // would miss almost any real accuracy roll
      let dealt;
      try {
        const s = makeWarrior();
        const creature = s.combat.enemies[0].creatureObj;
        const hpBefore = s.health;
        testHalfCounterReaction(s, creature);
        dealt = hpBefore - s.health;
      } finally {
        Math.random = origRandom;
      }
      return { pass: dealt > 0, dealt };
    });

    record('TESTREACTION-NO-CHAIN-MIRROR-SOUL', 'Reactions don\'t chain unless today\'s code already lets them: Mirror Soul (equipped, available) does NOT reflect this reaction, because calculateDamage\'s existing mirror_soul guard already excludes action.isReaction -- no new guard needed for this brand-new reaction to inherit that protection', () => {
      const s = makeWarrior();
      const creature = s.combat.enemies[0].creatureObj;
      creature.element = 'fire'; // mirror_soul's guard also requires creature.element to be truthy
      // hasEffect() reads equipped items; forcing it true here is the
      // same technique phase1_step1b_pipeline_parity.js's own
      // P1-MIRRORSOUL-* scenarios already use to equip mirror_soul.
      const origHasEffect = window.hasEffect;
      window.hasEffect = (st, id) => id === 'mirror_soul' ? true : origHasEffect(st, id);
      let mirrorSoulUsedBefore, mirrorSoulUsedAfter, lines;
      try {
        mirrorSoulUsedBefore = !!s.combat.player.mirrorSoulUsed;
        lines = testHalfCounterReaction(s, creature);
        mirrorSoulUsedAfter = !!s.combat.player.mirrorSoulUsed;
      } finally {
        window.hasEffect = origHasEffect;
      }
      const noReflectLine = !lines.some((l) => /Mirror Soul/.test(l));
      return { pass: !mirrorSoulUsedBefore && !mirrorSoulUsedAfter && noReflectLine, mirrorSoulUsedBefore, mirrorSoulUsedAfter, lines };
    });

    record('TESTREACTION-NO-CHAIN-REINFORCED', 'Reactions don\'t chain: Reinforced\'s own counter (activeEnemySlot(combat).reinforcedAttackCount) does NOT advance from this reaction, because chooseAction\'s existing guard already excludes action.isReaction -- same inherited protection as the real Riposte family, with zero new code', () => {
      const s = makeWarrior();
      const creature = s.combat.enemies[0].creatureObj;
      const origHasEffect = window.hasEffect;
      window.hasEffect = (st, id) => id === 'reinforced' ? true : origHasEffect(st, id);
      let countBefore, countAfter;
      try {
        countBefore = activeEnemySlot(s.combat).reinforcedAttackCount || 0;
        testHalfCounterReaction(s, creature);
        countAfter = activeEnemySlot(s.combat).reinforcedAttackCount || 0;
      } finally {
        window.hasEffect = origHasEffect;
      }
      return { pass: countAfter === countBefore, countBefore, countAfter };
    });

    record('TESTREACTION-DEDICATED-TAIL-NO-DEFEAT-DOUBLE-RESOLVE', 'applyAndReactReactionOnPlayer (already shipped for the Riposte family) is the tail this new reaction reuses unmodified -- confirmed by a lethal hit resolving defeat exactly once (one flavor line, one resolvePlayerDefeatOrDowned message -- makeWarrior has no allies, so "Everything goes dark."), via the same call that tail already makes', () => {
      const s = makeWarrior();
      const creature = s.combat.enemies[0].creatureObj;
      s.health = 1; // guarantees state.health <= 0 after any edmg > 0
      const lines = testHalfCounterReaction(s, creature);
      const defeatLine = lines.some((l) => /Everything goes dark/.test(l));
      return { pass: s.health <= 0 && lines.length === 2 && defeatLine, health: s.health, lines };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`Step 1f-iii §4 test-reaction proof: ${out.summary.passed}/${out.summary.total} passed`);
  if (out.summary.failed.length) {
    console.log('FAILURES:');
    for (const f of out.summary.failed) {
      console.log(`  ${f.code}: ${f.description}`);
      console.log(`    detail: ${JSON.stringify(f.detail)}`);
    }
  }
  await browser.close();
  console.log(`RESULT: ${out.summary.passed}/${out.summary.total}`);
})();
