// Combat Rebuild Phase 2, step 2e-2 bug fix (Tyler, 20 Nov): "Blessing of
// Freedom... implement the heal. Evading an attack, from any source of
// evasion, restores 5% of the wearer's max Health." Lands right after the
// new applyAndReact.onEvade hook exists (js/data/modifiers.js,
// js/engine/pipeline.js). "Evasion, from any source" = exactly the 3
// mechanics the item's own text calls Evasion (evasionCharges/
// evasionTurns' dedicated dodge roll, Avatar of Freedom's own roll,
// Blessing of Freedom's own 15% roll) -- NOT every miss/negation in
// rollToHit.defender's broader "miss" phase chain (confirmed via Tyler's
// own ruling after a clarifying question this session).
//
// Drives the REAL dispatch path (resolveEnemyAttackOnPlayer -> rollToHit
// -> the registry) with Math.random/hasEffect/hasSetTier stubbed, same
// `runOne` technique phase1_step1b_pipeline_parity.js already established
// for forcing a specific branch deterministically -- proof that the new
// wiring actually fires from real combat, not just a direct entry call.
//
//   node tools/tests/phase2_step2e2_blessing_of_freedom_evade_ledger.js
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

    function makeWarrior() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      return s;
    }

    // scenario: { effects: [ids], sets: ["Name:tier"], mutate(s, creature, slot), seq: [randoms] }
    // Same shape/technique as phase1_step1b_pipeline_parity.js's own
    // runOne -- no oracle comparison needed here, just the forced-roll
    // mechanics.
    function runOne(scenario) {
      const origRandom = Math.random;
      const origHasEffect = window.hasEffect;
      const origHasSetTier = window.hasSetTier;
      const effects = new Set(scenario.effects || []);
      const sets = new Set(scenario.sets || []);
      window.hasEffect = (obj, id) => effects.has(id);
      window.hasSetTier = (obj, setName, tier) => sets.has(`${setName}:${tier}`);
      let i = 0;
      const seq = scenario.seq && scenario.seq.length ? scenario.seq : [0.5];
      Math.random = () => seq[i++ % seq.length];
      try {
        const s = makeWarrior();
        startCombat(s, 'stoneback_beetle', 25);
        const slot = s.combat.enemies[0];
        const creature = slot.creatureObj;
        // A fresh GameState starts at full Health -- leave room to heal.
        s.health = Math.round(s.maxHealth * 0.6);
        if (scenario.mutate) scenario.mutate(s, creature, slot);
        const healthBefore = s.health;
        const result = resolveEnemyAttackOnPlayer(s, creature, 2, 0, null, null);
        return { result, healthBefore, healthAfter: s.health, maxHealth: s.maxHealth };
      } finally {
        Math.random = origRandom;
        window.hasEffect = origHasEffect;
        window.hasSetTier = origHasSetTier;
      }
    }
    function mendsLine(result) {
      return (result.lines || []).find((l) => l.includes('Blessing of Freedom mends you'));
    }

    record('P2-2E2-BLESSFREE-OWNROLL-HEAL-01', "Wearing Endless Horizon:2 (Blessing of Freedom): its own 15% evasion roll succeeds -> the attack misses AND the wearer heals 5% max Health", () => {
      const { result, healthBefore, healthAfter, maxHealth } = runOne({
        sets: ['Regalia of the Endless Horizon:2'],
        seq: [0.02, 0.02], // 0.02: accuracy connects; 0.02 < 0.15: Blessing of Freedom's own roll succeeds
      });
      const expectedHeal = Math.ceil(maxHealth * 0.05);
      return { pass: result.damage === 0 && healthAfter - healthBefore === expectedHeal && !!mendsLine(result), result, healthBefore, healthAfter, expectedHeal };
    });

    record('P2-2E2-BLESSFREE-AVATARROLL-HEAL-01', "Wearing Endless Horizon:2+6 with Avatar of Freedom's window open: Blessing of Freedom's own roll FAILS but Avatar of Freedom's own 50% roll succeeds -> still heals (any source of evasion, not just the item's own roll)", () => {
      const { result, healthBefore, healthAfter, maxHealth } = runOne({
        sets: ['Regalia of the Endless Horizon:2', 'Regalia of the Endless Horizon:6'],
        mutate: (s) => { s.combat.player.avatarOfFreedomTurns = 3; },
        seq: [0.02, 0.5, 0.02], // connects; Blessing of Freedom's 0.15 roll fails (0.5); Avatar of Freedom's 0.5 roll succeeds (0.02)
      });
      const expectedHeal = Math.ceil(maxHealth * 0.05);
      return { pass: result.damage === 0 && healthAfter - healthBefore === expectedHeal && !!mendsLine(result), result, healthBefore, healthAfter, expectedHeal };
    });

    record('P2-2E2-BLESSFREE-EVATURNS-HEAL-01', "Wearing Endless Horizon:2 with an evasionTurns window open (Air/Steamveil/Evasive Release's own mechanic): Blessing of Freedom's own roll FAILS but the dedicated evasion roll succeeds -> still heals", () => {
      const { result, healthBefore, healthAfter, maxHealth } = runOne({
        sets: ['Regalia of the Endless Horizon:2'],
        mutate: (s) => { s.combat.player.evasionTurns = 2; },
        seq: [0.02, 0.5, 0.02], // connects; Blessing of Freedom's roll fails (0.5); evasionTurns' own 0.5 roll succeeds (0.02)
      });
      const expectedHeal = Math.ceil(maxHealth * 0.05);
      return { pass: result.damage === 0 && healthAfter - healthBefore === expectedHeal && !!mendsLine(result), result, healthBefore, healthAfter, expectedHeal };
    });

    record('P2-2E2-BLESSFREE-HIT-NOHEAL-01', "Wearing Endless Horizon:2, the attack actually lands (no evasion at all): no heal", () => {
      const { result, healthBefore, healthAfter } = runOne({
        sets: ['Regalia of the Endless Horizon:2'],
        seq: [0.02, 0.5], // connects; Blessing of Freedom's roll fails -- nothing else can evade, so the hit lands
      });
      return { pass: result.damage > 0 && healthAfter <= healthBefore && !mendsLine(result), result, healthBefore, healthAfter };
    });

    record('P2-2E2-BLESSFREE-NONEVASIONMISS-NOHEAL-01', "Wearing Endless Horizon:2, a non-evasion miss (the baseline accuracy-vs-agility roll itself fails): no heal", () => {
      const { result, healthBefore, healthAfter } = runOne({
        sets: ['Regalia of the Endless Horizon:2'],
        seq: [0.99], // the accuracy-connects roll itself fails -- a plain miss, the registry chain is never even reached
      });
      return { pass: result.damage === 0 && healthAfter === healthBefore && !mendsLine(result), result, healthBefore, healthAfter };
    });

    record('P2-2E2-BLESSFREE-NOGEAR-NOHEAL-01', "NOT wearing the gear, even though a real evasion happens (evasionTurns from a different source, e.g. Air): no heal", () => {
      const { result, healthBefore, healthAfter } = runOne({
        mutate: (s) => { s.combat.player.evasionTurns = 2; },
        seq: [0.02, 0.02], // connects; evasionTurns' own roll succeeds -- a genuine evasion, just not from this item
      });
      return { pass: result.damage === 0 && healthAfter === healthBefore && !mendsLine(result), result, healthBefore, healthAfter };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`Blessing of Freedom evade-heal proof: ${out.summary.passed}/${out.summary.total} passed`);
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
