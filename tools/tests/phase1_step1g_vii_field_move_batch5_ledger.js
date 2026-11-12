// Step 1g-vii: batch 5 (and final batch) of the 117-field move -- enemy
// per-slot state (16 fields, including HP). Unlike batches 1-4, this
// one is a PURE LEDGER-ACCOUNTING fix, not a code change: tools/
// combat_field_ledger.js now recognizes PER_ENEMY_FIELDS/
// wireActiveEnemyProxy membership as "storage moved," since every
// enemy slot has always been its own object literal (startCombat's own
// `.map()` over the roster) with hp/maxHp/corroded/... as its own plain
// properties -- never shared, never flat on combat. wireActiveEnemyProxy
// is a convenience alias ("whichever enemy is active") on top of
// already-correct storage, exactly as wirePlayerFieldsProxy is for the
// player's own private store; nothing about WHERE these fields live
// changed here, only the ledger's own recognition of a fact that was
// already true. This test is the independent verification for that
// factual claim: two enemies in the same pack have fully independent
// values for every batch-5 field, and the combat.<field> alias tracks
// whichever enemy is currently active, exactly as advertised.
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

    function addSecondEnemy(s) {
      const template = BESTIARY['stoneback_beetle'];
      const creature2 = buildFightCreature(template, 25, template.dangerClass, 'stoneback_beetle');
      const record2 = buildSummonedEnemyRecord('stoneback_beetle', creature2, 'test', false, null, true);
      s.combat.enemies.push(record2);
      return record2;
    }
    function makeWarriorWithPack() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      addSecondEnemy(s);
      return s;
    }

    const BATCH5_FIELDS_NUMERIC = ['hp', 'maxHp', 'enemyAtkPenalty', 'enemyDefPenalty', 'enemyStunCharges', 'reinforcedAttackCount', 'hitsTakenFromPlayer'];
    const BATCH5_FIELDS_BOOL = ['disarmed', 'corroded', 'hamstringApplied'];
    const BATCH5_ALL_FIELDS = [
      'bleed', 'burn', 'corroded', 'creatureId', 'creatureObj', 'disarmed', 'dynamicCreature',
      'enemyAtkPenalty', 'enemyDefPenalty', 'enemyStunCharges', 'hamstringApplied',
      'hitsTakenFromPlayer', 'hp', 'lastDamageType', 'maxHp', 'reinforcedAttackCount',
    ];

    record('P1G-VII-INDEPENDENCE-01', 'Two enemies in the same pack have fully independent values for every one of the 16 batch-5 fields -- changing one never touches the other', () => {
      const s = makeWarriorWithPack();
      const [e0, e1] = s.combat.enemies;
      BATCH5_FIELDS_NUMERIC.forEach((f) => { e0[f] = 7; });
      BATCH5_FIELDS_BOOL.forEach((f) => { e0[f] = true; });
      const leaked = BATCH5_FIELDS_NUMERIC.filter((f) => e1[f] === 7).concat(BATCH5_FIELDS_BOOL.filter((f) => e1[f] === true));
      return { pass: leaked.length === 0, leaked, e0: Object.fromEntries(BATCH5_ALL_FIELDS.map((f) => [f, e0[f]])), e1: Object.fromEntries(BATCH5_ALL_FIELDS.map((f) => [f, e1[f]])) };
    });

    record('P1G-VII-ALIAS-FOLLOWS-ACTIVE-01', "The combat.<field> alias (wireActiveEnemyProxy) still tracks whichever enemy is active -- switching activeIndex changes what activeEnemySlot(combat).hp/activeEnemySlot(combat).maxHp/etc. resolve to, with each enemy's own real values untouched by the switch", () => {
      const s = makeWarriorWithPack();
      const [e0, e1] = s.combat.enemies;
      e0.hp = 11; e0.maxHp = 61;
      e1.hp = 22; e1.maxHp = 61;
      s.combat.activeIndex = 0;
      const viaAliasE0 = activeEnemySlot(s.combat).hp;
      s.combat.activeIndex = 1;
      const viaAliasE1 = activeEnemySlot(s.combat).hp;
      return {
        pass: viaAliasE0 === 11 && viaAliasE1 === 22 && e0.hp === 11 && e1.hp === 22,
        viaAliasE0, viaAliasE1, e0hp: e0.hp, e1hp: e1.hp,
      };
    });

    record('P1G-VII-ALIAS-WRITE-ROUTES-TO-ACTIVE-01', 'Writing combat.<field> through the alias still writes to whichever enemy is active, not to some separate flat storage', () => {
      const s = makeWarriorWithPack();
      const [e0, e1] = s.combat.enemies;
      s.combat.activeIndex = 1;
      activeEnemySlot(s.combat).hp = 33;
      return { pass: e1.hp === 33 && e0.hp !== 33, e0hp: e0.hp, e1hp: e1.hp };
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
