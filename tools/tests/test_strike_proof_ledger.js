// Step 1e completion handoff (9 Nov 2026 follow-up), §4: the test-strike
// proof. test_strike is a test-only action -- registered into
// PLAYER_ACTION_DEFS at RUNTIME, inside this script's own page.evaluate,
// never written to any file on disk, so it never appears in the real
// game. Proves that js/engine/resolver.js's generic usePlayerAction,
// built entirely from the step 1e completion handoff's schema/hooks
// (js/data/actions.js) and the unchanged five-step pipeline
// (js/engine/pipeline.js), can run a BRAND NEW action end to end with
// ZERO changes to pipeline.js, combat.js, or PIPELINE_HOOKS beyond the
// one generic onHitChanceEffect hook mechanism already committed
// separately for exactly this purpose (a41cfb7) -- registering
// test_strike's own definition really is the only thing this file adds.
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
    // place test_strike's definition exists. "Make it a physical
    // single-target attack at x1.25 that applies stagger at 50%" (the
    // handoff's own spec): extraDamageMultiplierFn is the x1.25,
    // onHitChanceEffect is the 50%-chance stagger (staggerOnHit, added in
    // a41cfb7 specifically so this proof could add nothing but data).
    PLAYER_ACTION_DEFS.test_strike = {
      name: 'Test Strike',
      cooldown: 2,
      actorKinds: ['player'], actionType: 'attack', targeting: 'singleEnemy',
      toHit: 'roll', formula: 'playerCore',
      missLine: (state, creature) => [`The test strike goes wide of ${withThe(creature.name, false)}.`],
      extraDamageMultiplierFn: () => 1.25,
      reportPhysical: 'always',
      flavorLine: (state, creature, edmg) => [`You land a test strike on ${withThe(creature.name, false)} for ${edmg} damage.`],
      onHitEffectsForm: 'unconditional',
      onHitChanceEffect: { chance: 0.5, hookName: 'staggerOnHit' },
      runsLowHealthChecks: true,
      followupForm: 'gated',
    };

    function makeWarrior() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      s.combat.enemies[0].hp = 100000;
      s.combat.enemies[0].maxHp = 100000; // non-kill: keep combat alive for the tail
      return s;
    }

    record('TESTSTRIKE-RUNS-FIVE-STEPS', 'test_strike runs through chooseAction -> chooseTargets -> rollToHit -> calculateDamage -> applyAndReact with zero pipeline.js changes beyond what already shipped', () => {
      const origRandom = Math.random;
      Math.random = () => 0.02; // guaranteed hit, low damage roll
      let hpBefore, hpAfter, lines;
      try {
        const s = makeWarrior();
        hpBefore = s.combat.enemies[0].hp;
        lines = usePlayerAction(s, 'test_strike');
        hpAfter = s.combat.enemies[0].hp;
      } finally {
        Math.random = origRandom;
      }
      const dealt = hpBefore - hpAfter;
      const hasFlavorLine = lines.some((l) => /test strike/.test(l));
      return { pass: dealt > 0 && hasFlavorLine, dealt, lines };
    });

    record('TESTSTRIKE-SHARED-FORMULA', 'test_strike deals damage via the shared playerCore formula (x1.25 of what basic_attack would deal on the identical roll, before Opening Reach/Feint/Borrowed Seconds -- none of which test_strike declares)', () => {
      const origRandom = Math.random;
      Math.random = () => 0.02;
      let basicDealt, testStrikeDealt;
      try {
        const s1 = makeWarrior();
        const hp0 = s1.combat.enemies[0].hp;
        playerAttack(s1);
        basicDealt = hp0 - s1.combat.enemies[0].hp;

        const s2 = makeWarrior();
        const hp1 = s2.combat.enemies[0].hp;
        usePlayerAction(s2, 'test_strike');
        testStrikeDealt = hp1 - s2.combat.enemies[0].hp;
      } finally {
        Math.random = origRandom;
      }
      // Both are forced to the exact same roll sequence and neither
      // triggers Opening Reach (basic_attack's own is physical-gated AND
      // consumes the same firstPhysicalAttackDone flag test_strike itself
      // never reads), so testStrikeDealt should be basicDealt's own core
      // damage x1.25, rounded.
      const expected = Math.round(basicDealt * 1.25);
      return { pass: Math.abs(testStrikeDealt - expected) <= 1, basicDealt, testStrikeDealt, expected };
    });

    record('TESTSTRIKE-APPLIES-STATUS', 'test_strike applies its declared onHitChanceEffect (staggerOnHit, forced to 100%) -- confirmed via the enemy skipping its own counter this round, the same stun mechanism staggerOnHit reuses', () => {
      const origRandom = Math.random;
      let i = 0;
      // First two draws: attack roll (low = hit) and crit roll; third+:
      // the onHitChanceEffect chance roll, forced to land under 0.5. The
      // stun charge is set AND consumed within this same call (the gate
      // check-and-consume happens later in the same turn's own
      // retaliation resolution), so the only observable is the enemy's
      // own "doesn't attack" line -- not a net change in the stored
      // charge count, which nets back to 0 by the time control returns.
      const seq = [0.02, 0.9, 0.01];
      Math.random = () => seq[Math.min(i++, seq.length - 1)];
      let lines;
      try {
        const s = makeWarrior();
        lines = usePlayerAction(s, 'test_strike');
      } finally {
        Math.random = origRandom;
      }
      const staggered = lines.some((l) => /still reeling and doesn't attack/.test(l));
      return { pass: staggered, staggered, lines };
    });

    record('TESTSTRIKE-RESPECTS-COOLDOWN', 'test_strike sets its own cooldown (2 turns) after use, and the generic resolver\'s gate blocks a second use before it expires', () => {
      const origRandom = Math.random;
      Math.random = () => 0.02;
      let cooldownAfterFirstUse, secondUseBlocked, secondUseLines;
      try {
        const s = makeWarrior();
        usePlayerAction(s, 'test_strike');
        cooldownAfterFirstUse = s.combat.cooldowns.test_strike;
        secondUseLines = usePlayerAction(s, 'test_strike');
        secondUseBlocked = /still recovering/.test(secondUseLines.join(' '));
      } finally {
        Math.random = origRandom;
      }
      return { pass: cooldownAfterFirstUse === 2 && secondUseBlocked, cooldownAfterFirstUse, secondUseBlocked, secondUseLines };
    });

    record('TESTSTRIKE-ACTION-TRACKING', 'test_strike counts toward action tracking (applyActionTypeTracking\'s own lastActionType, under test_strike\'s declared actionType "attack")', () => {
      const origRandom = Math.random;
      Math.random = () => 0.02;
      let lastActionType;
      try {
        const s = makeWarrior();
        usePlayerAction(s, 'test_strike');
        lastActionType = s.combat.player.lastActionType;
      } finally {
        Math.random = origRandom;
      }
      return { pass: lastActionType === 'attack', lastActionType };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`Step 1e completion §4 test-strike proof: ${out.summary.passed}/${out.summary.total} passed`);
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
