// Phase 1 close-out handoff §1: the enemy test-strike proof -- the
// missing third of spec §7 item 4's "a new action added purely as data
// works for the player, an ally, AND an enemy." The player side
// (test_strike_proof_ledger.js) and the ally side (test_ally_proof_
// ledger.js) are already proven; this is the enemy side, now that enemy
// Active abilities became definitions in step 1f-ii (js/data/
// enemyabilities.js's ENEMY_ABILITIES table, resolved generically by
// resolveEnemyActiveAbility/resolveEnemyAttackOnPlayer/OnAlly, all
// combat.js/pipeline.js). test_enemy_strike is a test-only
// ENEMY_ABILITIES entry -- registered at RUNTIME, inside this script's
// own page.evaluate, never written to any file on disk, so it never
// appears in the real game (same convention as the other two proofs).
// Shape: physical, single target (the default "dynamic" targeting --
// the exact shared pickEnemyAttackTarget rule every ordinary enemy
// already uses, not a bespoke one), x1.25 (dmgMult: 1.25), applies the
// existing "stagger" status at a 50% chance, 2-turn cooldown. Proves a
// brand-new enemy active can run end to end -- picked by
// resolveEnemyActiveAbility, dispatched through resolveEnemySingleTargetAttempt's
// shared party-share targeting (same roll Dregnar and every ordinary
// creature use, step 1g-i), and resolved through the exact same five
// pipeline steps (chooseAction -> chooseTargets -> rollToHit ->
// calculateDamage -> applyAndReact) the player/ally sides already
// proved -- with ZERO changes to combat.js/pipeline.js/
// enemyabilities.js: registering test_enemy_strike's own definition
// really is the only thing this file adds.
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
    // place test_enemy_strike's definition exists. No targeting/toHit/
    // actionType/formula declared: all four default to exactly the
    // shared shape (ENEMY_ACTIVE_ACTION_SHAPE) every ordinary active
    // already uses -- "single target" is that default ("dynamic"), not
    // a bespoke one written for this proof. "stagger" is an existing
    // STATUS_EFFECTS entry (-8 Defense/-15 Speed, 2 turns), reused as-is.
    ENEMY_ABILITIES.test_enemy_strike = {
      name: 'Test Enemy Strike', type: 'active', cooldown: 2, dmgMult: 1.25,
      inflict: { status: 'stagger', chance: 0.5 },
    };

    function withForcedHit(fn) {
      const oc = window.attackConnects;
      window.attackConnects = () => true;
      try { return fn(); } finally { window.attackConnects = oc; }
    }
    function makeWarrior(level) {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = level || 25;
      s.recomputeStats(false);
      return s;
    }
    // startCombat against an ordinary creature, then overwrite its
    // actives/passives so test_enemy_strike is the ONLY eligible active
    // -- the same technique the existing 1g-i/dregnar-regression tests
    // already use (c.actives = [...]; c.passives = [];) to isolate a
    // single ability deterministically, not a new pattern for this proof.
    function freshTestEnemy(level) {
      const s = makeWarrior(level);
      startCombat(s, 'stoneback_beetle', level || 25);
      const slot = s.combat.enemies[0];
      const c = slot.creatureObj;
      c.actives = ['test_enemy_strike'];
      c.passives = [];
      return { s, slot, c };
    }

    record('TESTENEMYSTRIKE-REGISTERED', 'test_enemy_strike registers into ENEMY_ABILITIES and getEnemyAbility fills in the shared active-ability defaults (dynamic targeting, a roll-based to-hit, actionType attack, the shared enemyCore formula) -- it never declares any of those itself', () => {
      const a = getEnemyAbility('test_enemy_strike');
      return {
        pass: !!a && a.name === 'Test Enemy Strike' && a.dmgMult === 1.25 && a.cooldown === 2
          && a.targeting === 'dynamic' && a.toHit === 'roll' && a.actionType === 'attack' && a.formula === 'enemyCore',
        a,
      };
    });

    record('TESTENEMYSTRIKE-PICKED-AND-RUNS-FIVE-STEPS', 'with zero allies present, resolveEnemyAction picks test_enemy_strike (its only eligible active) and resolveEnemySingleTargetAttempt/resolveEnemyAttackOnPlayer runs it through chooseAction -> chooseTargets -> rollToHit -> calculateDamage -> applyAndReact, landing on the player and naming the ability in its own flavor line', () => {
      const { s, c } = freshTestEnemy();
      const hpBefore = s.health;
      const result = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      const namesAbility = result.lines.some((l) => l.includes('Test Enemy Strike'));
      return { pass: result.damage > 0 && s.health < hpBefore && namesAbility, damage: result.damage, hpBefore, hpAfter: s.health, lines: result.lines };
    });

    record('TESTENEMYSTRIKE-SHARED-TARGETING-ALLY', 'the exact same ability, dispatched through the same shared pickEnemyAttackTarget rule (step 1g-i), lands on the one alive ally instead of the player when the player is downed -- proving the enemy side has no separate per-ability targeting path to add. (applyAndReact\'s own ally-target tail always reports damage: null regardless of ability -- the pre-existing, already-relied-upon return shape every other ally-targeted test in this suite checks ally.health for instead of result.damage; confirmed against live source before asserting on it here.)', () => {
      const { s, c } = freshTestEnemy();
      s.recruitAlly('kessa');
      s.playerDowned = true;
      const ally = s.party[0];
      const hpBefore = ally.health;
      withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: ally.health < hpBefore, hpBefore, hpAfter: ally.health };
    });

    record('TESTENEMYSTRIKE-APPLIES-STAGGER', "test_enemy_strike's declared inflict (stagger, forced under its own 50% chance) is applied generically through applyAbilityInflict -- the exact same status-application code path every other ability's own inflict already uses, with zero changes for this one", () => {
      const { s, c } = freshTestEnemy();
      const origRandom = Math.random;
      // Every draw forced well under 0.5 -- the crit/variance rolls this
      // also feeds don't need any particular value for this check (only
      // whether the inflict's own chance roll, wherever it falls in the
      // sequence, lands under its declared 0.5), so there's no need to
      // predict exactly how many draws precede it.
      Math.random = () => 0.01;
      let lines, staggerEntry;
      try {
        lines = withForcedHit(() => resolveEnemyAction(s, c, 2, 0)).lines;
        staggerEntry = s.combat.player.playerStatuses.stagger;
      } finally {
        Math.random = origRandom;
      }
      return { pass: !!staggerEntry && staggerEntry.debuff.def === -8, staggerEntry, lines };
    });

    record('TESTENEMYSTRIKE-RESPECTS-COOLDOWN', "test_enemy_strike banks its own 2-turn cooldown on the acting enemy's abilityCooldowns after use, through the exact same generic cooldown bookkeeping every other active ability relies on -- with no eligible active left (it was the only one), the creature's next action falls back to an ordinary basic attack instead of re-picking it", () => {
      const { s, c, slot } = freshTestEnemy();
      withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      const cooldownAfterFirstUse = slot.abilityCooldowns.test_enemy_strike;
      const secondPick = resolveEnemyActiveAbility(s, c);
      return { pass: cooldownAfterFirstUse === 2 && secondPick === null, cooldownAfterFirstUse, secondPick };
    });

    record('TESTENEMYSTRIKE-KILL-GOES-THROUGH-STEP5', "a hit from test_enemy_strike that would be lethal goes through applyAndReact's own normal step-5 tail (resolvePlayerDefeatOrDowned) and triggers the ordinary 'downed, not dead' rule (one ally alive to carry the fight) -- the identical path any other enemy ability's killing/downing hit already takes, nothing bespoke added for this ability", () => {
      const { s, c } = freshTestEnemy();
      s.recruitAlly('kessa'); // an alive ally is what makes this a down, not a full party-wipe defeat
      s.health = 1; // one hit is lethal
      const origRandom = Math.random;
      // With an ally present and the player NOT yet downed,
      // pickEnemyAttackTarget's own normal (non-downed) branch splits
      // the roll between player and ally -- forcing it low guarantees
      // "< playerShare" (the player branch), same as every low-roll
      // force elsewhere in this file guarantees a hit via
      // attackConnects. Without this the attack can land on Kessa
      // instead about 1 run in 3, leaving the player's health untouched
      // and this scenario intermittently failing -- confirmed by
      // actually catching that exact failure (lines: "...on Kessa Vire
      // for N damage.") in a 40-run loop before writing this fix.
      Math.random = () => 0.01;
      let result;
      try {
        result = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      } finally {
        Math.random = origRandom;
      }
      return { pass: s.playerDowned === true, playerDowned: s.playerDowned, health: s.health, lines: result.lines };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`Phase 1 close-out §1 enemy test-strike proof: ${out.summary.passed}/${out.summary.total} passed`);
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
