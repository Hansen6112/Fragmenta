// Combat Rebuild Phase 1, listed change D1 (Tyler, 9 Nov 2026): a
// stunned enemy's whole action is skipped, whatever it would have
// attacked -- not just when it happens to roll the player as its target.
// Fixed in js/engine/combat.js's resolveEnemyAction: the enemyStunCharges
// check now runs BEFORE any ability/summon/target is chosen, for every
// ordinary enemy (Dregnar's own bespoke resolver already did this
// correctly and is untouched -- see resolveDregnarAction). The old check,
// which lived inside pipeline chooseAction behind a
// `ctx.target.kind === "player"` guard, is gone.
//
// This can't be tested as old-vs-new parity against a kept oracle, the
// way steps 1b/1c are -- there is no "old" function that does this
// correctly to compare against; the point of this change is that the
// old behavior was wrong. Instead, each case here calls
// resolveEnemyAction/resolveEnemyActionWithFlurry directly (the real
// production entry point, one layer above the pipeline orchestrators)
// and asserts the fixed behavior, with "effect changed something"
// controls proving the skip is really caused by the stun charge and not
// some other difference between the forced-ally and forced-player setups.
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

    function makeWarriorWithAlly() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      const ally = s.recruitAlly('kessa');
      startCombat(s, 'stoneback_beetle', 25);
      return { s, ally };
    }

    function withForcedHit(fn) {
      const oc = window.attackConnects;
      window.attackConnects = () => true;
      try { return fn(); } finally { window.attackConnects = oc; }
    }

    function withStubbedTarget(targetResult, fn) {
      const orig = window.pickEnemyAttackTarget;
      let calls = 0;
      window.pickEnemyAttackTarget = () => { calls++; return targetResult; };
      try { return { result: fn(), calls }; } finally { window.pickEnemyAttackTarget = orig; }
    }

    function withStubbedAbility(abilityCtx, fn) {
      const orig = window.resolveEnemyActiveAbility;
      let calls = 0;
      window.resolveEnemyActiveAbility = () => { calls++; return abilityCtx; };
      try { return { result: fn(), calls }; } finally { window.resolveEnemyActiveAbility = orig; }
    }

    // ============ The fix: a stunned enemy skips its whole action ============

    record('D1-ALLY-01', 'A stunned enemy forced to target an ally skips its action entirely: the ally takes no damage, the charge decrements, and pickEnemyAttackTarget is never even called (the fix runs before target selection)', () => {
      const { s, ally } = makeWarriorWithAlly();
      const creature = s.combat.enemies[0].creatureObj;
      s.combat.enemies[0].enemyStunCharges = 1;
      const hpBefore = ally.health;
      const { result, calls } = withStubbedTarget({ kind: 'ally', ally }, () =>
        withForcedHit(() => resolveEnemyAction(s, creature, 2, 0)));
      return {
        pass: ally.health === hpBefore && s.combat.enemies[0].enemyStunCharges === 0 && calls === 0 && result.damage === 0,
        hpBefore, hpAfter: ally.health, charges: s.combat.enemies[0].enemyStunCharges, pickTargetCalls: calls, result,
      };
    });

    record('D1-PLAYER-01', 'A stunned enemy forced to target the player ALSO skips its action (preserved) -- same fix, same guard, regardless of which target it would have rolled', () => {
      const { s } = makeWarriorWithAlly();
      const creature = s.combat.enemies[0].creatureObj;
      s.combat.enemies[0].enemyStunCharges = 1;
      const hpBefore = s.health;
      const { result, calls } = withStubbedTarget({ kind: 'player' }, () =>
        withForcedHit(() => resolveEnemyAction(s, creature, 2, 0)));
      return {
        pass: s.health === hpBefore && s.combat.enemies[0].enemyStunCharges === 0 && calls === 0 && result.damage === 0,
        hpBefore, hpAfter: s.health, charges: s.combat.enemies[0].enemyStunCharges, pickTargetCalls: calls, result,
      };
    });

    record('D1-ABILITY-01', 'A stunned enemy with an active ability pending (e.g. a summon) never even gets as far as choosing that ability -- resolveEnemyActiveAbility is never called', () => {
      const { s } = makeWarriorWithAlly();
      const creature = s.combat.enemies[0].creatureObj;
      s.combat.enemies[0].enemyStunCharges = 1;
      const { result, calls } = withStubbedAbility({ id: 'fake_summon', summon: { creatureId: 'stoneback_beetle', count: 1 } }, () =>
        resolveEnemyAction(s, creature, 2, 0));
      return {
        pass: calls === 0 && s.combat.enemies[0].enemyStunCharges === 0 && result.damage === 0,
        abilityCalls: calls, charges: s.combat.enemies[0].enemyStunCharges, result,
      };
    });

    // ============ Controls: proves the skips above are really about stun ============

    record('D1-CONTROL-ALLY-01', '"Effect changed something": the SAME forced-ally setup as D1-ALLY-01, but with no stun charge, actually lands a hit -- the skip above was caused by the charge, not by the forced-target stubbing itself (ally-target applyAndReact always returns damage: null by design -- see pipeline.js -- so this checks the HP delta instead)', () => {
      const { s, ally } = makeWarriorWithAlly();
      const creature = s.combat.enemies[0].creatureObj;
      // No stun charge set: enemyStunCharges is undefined/0.
      const hpBefore = ally.health;
      const { result, calls } = withStubbedTarget({ kind: 'ally', ally }, () =>
        withForcedHit(() => resolveEnemyAction(s, creature, 2, 0)));
      return {
        pass: ally.health < hpBefore && calls === 1,
        hpBefore, hpAfter: ally.health, pickTargetCalls: calls, result,
      };
    });

    record('D1-CONTROL-PLAYER-01', '"Effect changed something": the SAME forced-player setup as D1-PLAYER-01, but with no stun charge, actually lands a hit', () => {
      const { s } = makeWarriorWithAlly();
      const creature = s.combat.enemies[0].creatureObj;
      const hpBefore = s.health;
      const { result, calls } = withStubbedTarget({ kind: 'player' }, () =>
        withForcedHit(() => resolveEnemyAction(s, creature, 2, 0)));
      return {
        pass: s.health < hpBefore && calls === 1 && result.damage > 0,
        hpBefore, hpAfter: s.health, pickTargetCalls: calls, result,
      };
    });

    record('D1-CONTROL-ABILITY-01', '"Effect changed something": the SAME ability setup as D1-ABILITY-01, but with no stun charge, actually calls resolveEnemyActiveAbility', () => {
      const { s } = makeWarriorWithAlly();
      const creature = s.combat.enemies[0].creatureObj;
      const { result, calls } = withStubbedAbility({ id: 'fake_summon', summon: { creatureId: 'stoneback_beetle', count: 1 } }, () =>
        resolveEnemyAction(s, creature, 2, 0));
      return { pass: calls === 1 && result.damage === null, abilityCalls: calls, result };
    });

    // ============ Flurry: each action slot checks/consumes its own charge ============

    record('D1-FLURRY-01', 'A Flurry enemy with exactly 1 stun charge skips its FIRST action (charge spent) but takes its second, normally -- each action slot checks separately, same as Dregnar\'s own normal/bonus split', () => {
      const { s, ally } = makeWarriorWithAlly();
      const creature = s.combat.enemies[0].creatureObj;
      creature.flurry = true;
      s.combat.enemies[0].enemyStunCharges = 1;
      const hpBefore = ally.health;
      const { result } = withStubbedTarget({ kind: 'ally', ally }, () =>
        withForcedHit(() => resolveEnemyActionWithFlurry(s, creature, 2, 0)));
      return {
        pass: ally.health < hpBefore && s.combat.enemies[0].enemyStunCharges === 0,
        hpBefore, hpAfter: ally.health, charges: s.combat.enemies[0].enemyStunCharges, result,
      };
    });

    record('D1-FLURRY-02', 'A Flurry enemy with 2 stun charges skips BOTH actions -- the charge is consumed per action slot, not per turn', () => {
      const { s, ally } = makeWarriorWithAlly();
      const creature = s.combat.enemies[0].creatureObj;
      creature.flurry = true;
      s.combat.enemies[0].enemyStunCharges = 2;
      const hpBefore = ally.health;
      const { result } = withStubbedTarget({ kind: 'ally', ally }, () =>
        withForcedHit(() => resolveEnemyActionWithFlurry(s, creature, 2, 0)));
      return {
        pass: ally.health === hpBefore && s.combat.enemies[0].enemyStunCharges === 0 && result.damage === 0,
        hpBefore, hpAfter: ally.health, charges: s.combat.enemies[0].enemyStunCharges, result,
      };
    });

    // ============ Dregnar: bespoke resolver untouched, no double-consumption ============

    record('D1-DREGNAR-UNCHANGED-01', "Dregnar Ashvein's bossKit dispatch returns before the new top-level check, so his own per-action-slot stun handling (resolveDregnarAction) is exactly as before -- one charge is consumed exactly once, not twice", () => {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 60;
      s.recomputeStats(false);
      s.health = s.maxHealth * 1000; s.maxHealth = s.maxHealth * 1000;
      startCombat(s, 'dregnar_ashvein', 30);
      const creature = s.combat.creatureObj;
      s.combat.enemyStunCharges = 1; // PER_ENEMY_FIELDS proxy -> the active (only) enemy slot
      const result = withForcedHit(() => resolveEnemyAction(s, creature, 2, 0));
      return {
        pass: s.combat.enemyStunCharges === 0 && result.damage == null,
        charges: s.combat.enemyStunCharges, result,
      };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`D1 stun fix: ${out.summary.passed}/${out.summary.total} passed`);
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
