// R1b (27 Nov), plumbing proof: applyAndReact.onLowHealth was only ever
// dispatched for the player (combat.js's lowHealthTriggerChecks, 11
// call sites, none touched here); this proves the new ally-side sibling
// (lowHealthTriggerChecksForAlly, called from resolveEnemyAttackOnAlly,
// the one shared choke point every enemy attack on an ally goes
// through) actually reaches a brand-new, disposable, holders:["ally"]
// test entry -- a hit that drops the ally below the threshold fires it
// exactly once, a hit that doesn't fire it at all, and the player's own
// existing dispatch is completely unaffected (role isolation).
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
        detail = { error: e.message, stack: (e.stack || '').split('\n').slice(0, 4).join(' / ') };
      }
      ledger.push({ code, description, pass: passed && errors === 0, errors, detail });
    }
    function withForcedHit(fn) {
      const oc = window.attackConnects;
      window.attackConnects = () => true;
      try { return fn(); } finally { window.attackConnects = oc; }
    }

    let fireCount = 0;
    registerBehavior('r1bTestLowHealthFire', () => { fireCount++; return undefined; });
    registerModifier('always:r1b_test_low_health', {
      source: { kind: 'always' },
      hook: 'applyAndReact.onLowHealth', order: 999, bucket: null, value: null,
      behavior: 'r1bTestLowHealthFire', params: null,
      when: (ctx) => ctx.holder.health > 0 && ctx.holder.health < ctx.holder.maxHealth * 0.25,
      holders: ['ally'], state: null,
      notes: 'R1b plumbing proof (test-only, never shipped): fires once whenever the holder it dispatches for drops under 25% Health.',
    });

    function freshPartyVsStoneback() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      const kessa = s.recruitAlly('kessa');
      s.party = [kessa];
      return { s, kessa, creature: s.combat.enemies[0].creatureObj };
    }

    record('R1B-LOWHEALTH-ALLY-ABSENT-ABOVE-THRESHOLD', 'A hit that leaves the ally above 25% Health never fires the test entry', () => {
      fireCount = 0;
      const { s, kessa, creature } = freshPartyVsStoneback();
      kessa.health = kessa.maxHealth; // full health, a small hit won't cross 25%
      withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.01 }));
      return { pass: fireCount === 0, fireCount, allyHealth: kessa.health, allyMax: kessa.maxHealth };
    });

    record('R1B-LOWHEALTH-ALLY-FIRES-ON-CROSSING', 'A hit that drops the ally below 25% Health fires the test entry exactly once, for the ALLY (not the player)', () => {
      fireCount = 0;
      const { s, kessa, creature } = freshPartyVsStoneback();
      kessa.health = Math.round(kessa.maxHealth * 0.3); // just above threshold
      withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 5 }));
      const crossedBelow = kessa.health > 0 && kessa.health < kessa.maxHealth * 0.25;
      return { pass: crossedBelow && fireCount === 1, fireCount, crossedBelow, allyHealth: kessa.health, allyMax: kessa.maxHealth };
    });

    record('R1B-LOWHEALTH-PLAYER-UNAFFECTED', "The player's own existing applyAndReact.onLowHealth dispatch never reaches this ally-only test entry, confirming role isolation", () => {
      fireCount = 0;
      const { s } = freshPartyVsStoneback();
      s.health = Math.round(s.maxHealth * 0.1); // deep below threshold
      lowHealthTriggerChecks(s); // the player's own, pre-existing, unchanged call
      return { pass: fireCount === 0, fireCount };
    });

    record('R1B-LOWHEALTH-ALLY-KILLED-SKIPS-CHECK', 'A hit that kills the ally outright never reaches the low-health check at all (ally.alive is false)', () => {
      fireCount = 0;
      const { s, kessa, creature } = freshPartyVsStoneback();
      kessa.health = 1;
      withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 50 }));
      return { pass: !kessa.alive && fireCount === 0, alive: kessa.alive, fireCount };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`R1b low-health ally plumbing proof: ${out.summary.passed}/${out.summary.total} passed`);
  if (out.summary.failed.length) {
    console.log('FAILURES:');
    for (const f of out.summary.failed) {
      console.log(`  ${f.code}: ${f.description}`);
      console.log(`    detail: ${JSON.stringify(f.detail)}`);
    }
  }
  await browser.close();
  console.log(`RESULT: ${out.summary.passed}/${out.summary.total}`);
  process.exit(out.summary.passed === out.summary.total ? 0 : 1);
})();
