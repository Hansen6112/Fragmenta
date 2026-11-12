// Appendix A (task #114, deferred until after Combat Rebuild Phase 1
// step 1h completed): applyGroundbreakerAccuracyDebuff/
// tickGroundbreakerDebuffs (js/engine/companion.js) clamped the debuff
// at 0 Accuracy but recorded the FULL requested amount for later
// restoration, not the amount actually removed. An enemy with less
// Accuracy than the debuff (6 base, hit by the -10 debuff) only ever
// lost 6 -- but got the full 10 added back when the debuff expired,
// leaving it permanently 4 Accuracy ABOVE its own starting value. Fixed
// by recording `applied` (the real before-minus-after delta) instead of
// the raw `amount`, and restoring that instead.
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

    record('APPENDIXA-GB-CLAMPED-01', "a debuff LARGER than the enemy's base Accuracy clamps at 0 (not negative), and restores exactly back to the original base -- not inflated by the unapplied remainder", () => {
      const s = makeWarrior();
      startCombat(s, 'stoneback_beetle', 25);
      const enemyRecord = s.combat.enemies[0];
      enemyRecord.creatureObj.acc = 6; // below the debuff amount, so the floor clamp DOES kick in
      const baseAcc = enemyRecord.creatureObj.acc;
      applyGroundbreakerAccuracyDebuff(s, enemyRecord, 10, 1);
      const afterApply = enemyRecord.creatureObj.acc === 0; // clamped, not -4
      tickGroundbreakerDebuffs(s); // expires and restores
      const afterTick = enemyRecord.creatureObj.acc === baseAcc; // exactly 6, not 10 (the bug: 0 + full amount)
      return { pass: afterApply && afterTick, afterApply, afterTick, baseAcc, accAfterApply: 0, accAfterTick: enemyRecord.creatureObj.acc };
    });

    record('APPENDIXA-GB-NORMAL-01', "a debuff SMALLER than the enemy's base Accuracy (the clamp never engages) still restores exactly -- confirms the fix changes nothing about the already-correct normal case", () => {
      const s = makeWarrior();
      startCombat(s, 'stoneback_beetle', 25);
      const enemyRecord = s.combat.enemies[0];
      enemyRecord.creatureObj.acc = 20; // comfortably above the debuff amount
      const baseAcc = enemyRecord.creatureObj.acc;
      applyGroundbreakerAccuracyDebuff(s, enemyRecord, 10, 1);
      const afterApply = enemyRecord.creatureObj.acc === baseAcc - 10;
      tickGroundbreakerDebuffs(s);
      const afterTick = enemyRecord.creatureObj.acc === baseAcc;
      return { pass: afterApply && afterTick, afterApply, afterTick, baseAcc, accAfterApply: enemyRecord.creatureObj.acc };
    });

    record('APPENDIXA-GB-EXACTZERO-01', "a debuff exactly equal to the enemy's base Accuracy (lands exactly on the clamp boundary) still restores exactly -- the boundary case between the other two", () => {
      const s = makeWarrior();
      startCombat(s, 'stoneback_beetle', 25);
      const enemyRecord = s.combat.enemies[0];
      enemyRecord.creatureObj.acc = 10;
      const baseAcc = enemyRecord.creatureObj.acc;
      applyGroundbreakerAccuracyDebuff(s, enemyRecord, 10, 1);
      const afterApply = enemyRecord.creatureObj.acc === 0;
      tickGroundbreakerDebuffs(s);
      const afterTick = enemyRecord.creatureObj.acc === baseAcc;
      return { pass: afterApply && afterTick, afterApply, afterTick, baseAcc, accAfterTick: enemyRecord.creatureObj.acc };
    });

    return ledger;
  });

  await browser.close();
  const pass = out.filter((r) => r.pass).length;
  for (const r of out) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.code}: ${r.description}`);
    if (!r.pass) console.log('   ', JSON.stringify(r.detail));
  }
  console.log(`RESULT: ${pass}/${out.length}`);
  process.exit(pass === out.length ? 0 : 1);
})();
