// Step 1f-i handoff §2's own proof: "a throwaway test ally with its own
// small kit (a formula and one hook), added as data plus that one hook.
// It attacks correctly through the pipeline with no changes to the step
// functions." test_ally is a test-only ALLY_DEFS entry -- registered into
// ALLY_DEFS, PIPELINE_FORMULAS, and PIPELINE_HOOKS at RUNTIME, inside this
// script's own page.evaluate, never written to any file on disk, so it
// never appears in the real game (same convention as test_strike_proof_
// ledger.js's own PLAYER_ACTION_DEFS.test_strike). Proves that a brand
// new kit-bearing ally -- reached through the real call site
// (resolveCompanionAction -> basicCompanionAttack, js/engine/companion.js
// + js/engine/pipeline.js, both already committed for Hadrian) -- can
// attack end to end with ZERO changes to companion.js or pipeline.js:
// registering test_ally's own formula/hooks really is the only thing
// this file adds.
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
    // place any of test_ally's three pieces exist. A deliberately simple,
    // non-random formula (no randInt band, unlike kitAllyBasic/
    // kitAllyAbility) so each assertion below can check an EXACT number,
    // not a range -- that simplicity is a test-only choice, not a new
    // shape other kits must follow.
    PIPELINE_FORMULAS.testAllyFormula = function (actor, target, action, ctx, hitInfo) {
      const ally = actor.ref;
      const atkBonusHook = action.hooks && action.hooks.atkBonus;
      const atkBonus = atkBonusHook ? PIPELINE_HOOKS[atkBonusHook]({ ally }) : 0;
      return { edmg: Math.round((ally.atk + atkBonus) * 0.5), extra: {} };
    };
    PIPELINE_HOOKS.testAllyAtkBonusHook = function (h) {
      return 10; // flat, known bonus -- proves the atkBonus hook is read generically
    };
    PIPELINE_HOOKS.testAllyOnDamageHook = function (h) {
      return h.edmg + 3; // proves action.hooks.onDamage is read generically
    };
    PIPELINE_HOOKS.testAllyOnKillHook = function (h) {
      h.state.testAllyKillFired = true; // proves action.hooks.onKill is read generically
    };
    ALLY_DEFS.test_ally = {
      name: 'Test Ally',
      tagline: 'a throwaway proof, not a real companion',
      description: 'Exists only inside this test file.',
      atkMod: 0, defMod: 0, healthMod: 0, accuracyMod: 0, agilityMod: 0, speedMod: 0,
      growth: { atk: 0, def: 0, health: 0, accuracy: 0, agility: 0, speed: 0 },
      abilityKit: {
        actives: [], passives: [], vulnerability: null,
        action: { formula: 'testAllyFormula', hooks: { atkBonus: 'testAllyAtkBonusHook', onDamage: ['testAllyOnDamageHook'], onKill: ['testAllyOnKillHook'] } },
      },
    };

    function makeWarriorWithTestAlly() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      const ally = s.recruitAlly('test_ally');
      startCombat(s, 'stoneback_beetle', 25);
      s.combat.enemies[0].hp = 100000;
      s.combat.enemies[0].maxHp = 100000; // non-kill, for the first three checks
      return { s, ally };
    }

    record('TESTALLY-RECRUITED', 'test_ally registers into ALLY_DEFS and recruitAlly builds a normal ally object from it (defId/atk/accuracy all populated by the unchanged recomputeAllyStats)', () => {
      const { ally } = makeWarriorWithTestAlly();
      return { pass: !!ally && ally.defId === 'test_ally' && typeof ally.atk === 'number', ally: ally && { defId: ally.defId, atk: ally.atk, accuracy: ally.accuracy } };
    });

    record('TESTALLY-ATTACKS-THROUGH-REAL-ENTRY-POINT', 'resolveCompanionAction (the real per-round call site, unchanged) falls through to basicCompanionAttack for test_ally (empty actives/passives) and deals damage via the generic kit-bearing ally path -- zero companion.js/pipeline.js changes', () => {
      const origRandom = Math.random;
      Math.random = () => 0.02; // guaranteed hit
      let hpBefore, hpAfter, lines;
      try {
        const { s, ally } = makeWarriorWithTestAlly();
        hpBefore = s.combat.enemies[0].hp;
        lines = resolveCompanionAction(s, ally);
        hpAfter = s.combat.enemies[0].hp;
      } finally {
        Math.random = origRandom;
      }
      const dealt = hpBefore - hpAfter;
      return { pass: dealt > 0, dealt, lines };
    });

    record('TESTALLY-FORMULA-AND-ATKBONUS-HOOK', 'damage dealt matches testAllyFormula exactly: round((ally.atk + atkBonus(10)) * 0.5), then +3 from the onDamage hook -- both hooks reached only by the declared names on test_ally\'s own action block', () => {
      const origRandom = Math.random;
      Math.random = () => 0.02;
      let dealt, allyAtk;
      try {
        const { s, ally } = makeWarriorWithTestAlly();
        allyAtk = ally.atk;
        const hpBefore = s.combat.enemies[0].hp;
        resolveCompanionAction(s, ally);
        dealt = hpBefore - s.combat.enemies[0].hp;
      } finally {
        Math.random = origRandom;
      }
      const expected = Math.round((allyAtk + 10) * 0.5) + 3;
      return { pass: dealt === expected, dealt, expected, allyAtk };
    });

    record('TESTALLY-ONKILL-HOOK', 'killing the enemy through test_ally\'s attack fires action.hooks.onKill (testAllyOnKillHook), reached by name through PIPELINE_HOOKS -- never a direct call to a named helper', () => {
      const origRandom = Math.random;
      Math.random = () => 0.02;
      let killFired;
      try {
        const { s, ally } = makeWarriorWithTestAlly();
        s.combat.enemies[0].hp = 1; // one hit kills
        s.combat.enemies[0].maxHp = 1;
        resolveCompanionAction(s, ally);
        killFired = !!s.testAllyKillFired;
      } finally {
        Math.random = origRandom;
      }
      return { pass: killFired, killFired };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`Step 1f-i test-ally proof: ${out.summary.passed}/${out.summary.total} passed`);
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
