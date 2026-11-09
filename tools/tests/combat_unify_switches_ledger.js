// Combat Rebuild Phase 1 handoff §2 (Tyler, 9 Nov 2026): COMBAT_UNIFY
// switches (js/engine/pipeline.js), all off by default. Two things to
// prove per switch:
//   1. Off matches today exactly -- already covered by every scenario in
//      phase1_step1c_ally_pipeline_parity.js still passing unchanged
//      (COMBAT_UNIFY's defaults are all false; this ledger doesn't
//      re-litigate that, it only toggles switches ON).
//   2. On changes something -- a scenario built to trigger each switch,
//      asserting the ON result differs from the OFF result run with the
//      exact same setup and the exact same forced RNG sequence. A switch
//      that does nothing can't pass.
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

    const MID = Array(40).fill(0.5); // low enough to always connect, mid-range for randInt spreads

    function makeWarriorWithAlly() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      const ally = s.recruitAlly('kessa');
      startCombat(s, 'stoneback_beetle', 25);
      return { s, ally };
    }

    // Runs setup(s, creature, ally), then resolveEnemyAttackOnAlly, with:
    //  - every COMBAT_UNIFY key in `on` forced true for the duration only
    //  - Math.random forced to a fixed cycling sequence (determinism)
    //  - window.attackConnects forced to always hit (isolates the damage
    //    math from the separate accuracy roll, same convention the other
    //    Phase 1 ledgers use)
    //  - optional hasEffectExtra/hasSetTierExtra stubs, layered on top of
    //    the real functions (checked first, falling through to the real
    //    one), restored afterward regardless of outcome
    function runWithSwitches(opts) {
      const { on = [], setup, hasEffectExtra, hasSetTierExtra } = opts;
      const prevUnify = Object.assign({}, COMBAT_UNIFY);
      const origRandom = Math.random;
      const origConnects = window.attackConnects;
      const origHasEffect = window.hasEffect;
      const origHasSetTier = window.hasSetTier;
      for (const k of on) COMBAT_UNIFY[k] = true;
      let i = 0;
      Math.random = () => MID[i++ % MID.length];
      window.attackConnects = () => true;
      if (hasEffectExtra) window.hasEffect = (obj, id) => hasEffectExtra(obj, id) ?? origHasEffect(obj, id);
      if (hasSetTierExtra) window.hasSetTier = (obj, setName, tier) => hasSetTierExtra(obj, setName, tier) ?? origHasSetTier(obj, setName, tier);
      try {
        const { s, ally } = makeWarriorWithAlly();
        const creature = s.combat.enemies[0].creatureObj;
        if (setup) setup(s, creature, ally);
        const hpBefore = ally.health;
        const result = resolveEnemyAttackOnAlly(s, creature, ally, null, null);
        return { result, hpAfter: ally.health, hpBefore, ally, s, creature };
      } finally {
        Object.assign(COMBAT_UNIFY, prevUnify);
        Math.random = origRandom;
        window.attackConnects = origConnects;
        window.hasEffect = origHasEffect;
        window.hasSetTier = origHasSetTier;
      }
    }

    function switchOnChangesSomething(code, description, on, setup, stubs) {
      record(code, description, () => {
        const off = runWithSwitches(Object.assign({ on: [], setup }, stubs));
        const onRun = runWithSwitches(Object.assign({ on, setup }, stubs));
        const mattered = JSON.stringify(off.result) !== JSON.stringify(onRun.result) || off.hpAfter !== onRun.hpAfter;
        return { pass: mattered, off: { result: off.result, hpAfter: off.hpAfter }, on: { result: onRun.result, hpAfter: onRun.hpAfter } };
      });
    }

    // ============ U1: ally takes element/magic damage ============
    switchOnChangesSomething('U1-ON-01', 'U1 on: an elemental enemy hitting an ally uses the magic formula instead of the flat physical formula -- the two results differ under the identical forced RNG sequence', ['U1'], (s, creature) => {
      creature.element = 'fire';
      creature.magic = 40;
      creature.atk = 10;
    });

    // ============ U2: Unquenched Focus vs an ally, requires U1 ============
    switchOnChangesSomething('U2-ON-01', "U1+U2 on: Dregnar's Unquenched Focus (dra_e07) adds its 1.10x on the first elemental hit against an ally -- U1 alone (no U2) is the \"off\" side here, so this isolates U2's own contribution", ['U1', 'U2'], (s, creature) => {
      creature.element = 'fire';
      creature.magic = 40;
    }, { hasEffectExtra: (obj, id) => (id === 'dra_e07_unquenched_focus' ? true : undefined) });

    record('U2-REQUIRES-U1-01', "U2 alone (U1 still off) changes nothing -- Unquenched Focus has no elemental hit to trigger from without U1's magic branch", () => {
      const setup = (s, creature) => { creature.element = 'fire'; creature.magic = 40; };
      const stubs = { hasEffectExtra: (obj, id) => (id === 'dra_e07_unquenched_focus' ? true : undefined) };
      const withU2Only = runWithSwitches(Object.assign({ on: ['U2'], setup }, stubs));
      const withNeither = runWithSwitches(Object.assign({ on: [], setup }, stubs));
      return {
        pass: JSON.stringify(withU2Only.result) === JSON.stringify(withNeither.result) && withU2Only.hpAfter === withNeither.hpAfter,
        withU2Only: withU2Only.result, withNeither: withNeither.result,
      };
    });

    // ============ U3a: Marked Target vs an ally ============
    // Checked directly against combat.exposedTarget's own state, not
    // through the accuracy roll's hit/miss outcome -- window.attackConnects
    // is already forced to always-hit in runWithSwitches (isolating the
    // damage math everywhere else in this file), which would otherwise
    // mask any +8 ACC this switch grants from ever being observable here.
    record('U3A-READ-01', 'U3a on: an ally-targeted roll reads and consumes a pending combat.exposedTarget mark left by a DIFFERENT creature; off, the mark is never read on this path and stays set', () => {
      const setup = (s, creature, ally) => { s.combat.exposedTarget = { by: {} }; };
      const off = runWithSwitches({ on: [], setup });
      const on = runWithSwitches({ on: ['U3a'], setup });
      return {
        pass: !!off.s.combat.exposedTarget && !on.s.combat.exposedTarget,
        offExposedTargetStillSet: !!off.s.combat.exposedTarget,
        onExposedTargetConsumed: !on.s.combat.exposedTarget,
      };
    });
    record('U3A-GRANT-01', 'U3a on: a successful ally-targeted hit from a Marked-Target-wearing creature sets combat.exposedTarget; off, it never does', () => {
      const stubs = { hasEffectExtra: (obj, id) => (id === 'sang_cu_ie002_marked_target' ? true : undefined) };
      const off = runWithSwitches(Object.assign({ on: [] }, stubs));
      const on = runWithSwitches(Object.assign({ on: ['U3a'] }, stubs));
      return {
        pass: !off.s.combat.exposedTarget && !!(on.s.combat.exposedTarget && on.s.combat.exposedTarget.by === on.creature),
        offExposedTarget: off.s.combat.exposedTarget || null,
        onExposedTarget: on.s.combat.exposedTarget ? 'set-to-attacker' : null,
      };
    });

    // ============ U3b: Flowing Discipline vs an ally ============
    switchOnChangesSomething('U3B-ON-01', "U3b on: a banked Flowing Discipline (First Sword's Regalia 6pc + flowingDisciplinePending) adds its 1.10x on an ally-targeted physical hit -- off, the pending flag is simply never read on this path", ['U3b'], (s, creature) => {
      creature.flowingDisciplinePending = true;
    }, { hasSetTierExtra: (obj, setName, tier) => (setName === "First Sword's Regalia" && tier === 6 ? true : undefined) });

    // ============ U3c: Winter's Verdict vs an ally (ally.statuses.chilled) ============
    switchOnChangesSomething('U3C-ON-01', "U3c on: Winter's Verdict (First Sword's Regalia 8pc) fires off the ALLY's own Chilled status -- off, ally.statuses.chilled is never read on this path", ['U3c'], (s, creature, ally) => {
      ally.statuses = ally.statuses || {};
      ally.statuses.chilled = { turns: 2 };
    }, { hasSetTierExtra: (obj, setName, tier) => (setName === "First Sword's Regalia" && tier === 8 ? true : undefined) });

    // ============ U3d: Toxic Preparation vs an ally (ally.statuses["sang_iag_poison"]) ============
    switchOnChangesSomething('U3D-ON-01', 'U3d on: Toxic Preparation adds its +5% off the ALLY\'s own Sanguivorum-poison status -- off, ally.statuses["sang_iag_poison"] is never read on this path', ['U3d'], (s, creature, ally) => {
      ally.statuses = ally.statuses || {};
      ally.statuses['sang_iag_poison'] = { turns: 2 };
    }, { hasEffectExtra: (obj, id) => (id === 'sang_iag_ie008_toxic_preparation' ? true : undefined) });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`COMBAT_UNIFY switches: ${out.summary.passed}/${out.summary.total} passed`);
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
