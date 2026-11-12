// Step 1g-v: batch 3 of the 117-field move -- 37 set/gear stacks and
// bonuses (the handoff's own "about 41" was approximate) moved into the
// player's own private store via PLAYER_FIELDS/wirePlayerFieldsProxy,
// same mechanism as batches 1-2. Same structural proof shape, plus a
// targeted check for groundbreakerDebuffs specifically -- the one
// non-scalar field in this batch (an array, mutated via push/filter
// rather than reassignment), to confirm the accessor's get() returning
// the live array reference still lets in-place mutation work.
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

    function makeWarrior() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      return s;
    }

    const BATCH3_SCALAR_FIELDS = [
      'adaptiveTideMagicStacks', 'adaptiveTidePhysicalStacks', 'adaptiveWardElement',
      'battleTemperedAtkStacks', 'battleTemperedDefStacks', 'blessingOfFortuneCritStacks',
      'calmWatersDefBonus', 'calmWatersMagicBonus', 'calmWatersTurns',
      'compassionsGraceDefStacks', 'endlessCurrentStacks', 'endlessStudyMagicBonus',
      'everyChoiceAtkStacks', 'everyChoiceMagicStacks', 'forestGuardianBonus',
      'lastStandAtkBonus', 'livingCurrentStacks', 'livingSteelBonus',
      'orderedMindDefStacks', 'perfectMemoryKnowledgeBonus', 'queenCarapaceBonus',
      'reinforcedDefStacks', 'riverWardenMagicBonus', 'sovereigntyTurnsLeft', 'temperedSteelStacks',
      'unbrokenLineHitCount', 'unwaveringDevotionStacks', 'wallsEndureDefStacks',
      'whiteWatchRiposteDefBonus', 'windsOfChangeAtk', 'windsOfChangeDef', 'windsOfChangeKnowledge',
      'windsOfChangeMagic', 'workRefinesAtkStacks', 'workRefinesMagicStacks', 'worthyChallengeStacks',
    ];
    const BATCH3_ALL_FIELDS = [...BATCH3_SCALAR_FIELDS, 'groundbreakerDebuffs'];

    record('P1G-V-ACCESSOR-01', 'All 37 batch-3 fields live as plain data properties on combat.player and nowhere on combat itself -- step 1h-iii deleted the accessor alias once every call site moved onto combat.player', () => {
      const s = makeWarrior();
      const bad = BATCH3_ALL_FIELDS.filter((f) => {
        const onPlayer = Object.getOwnPropertyDescriptor(s.combat.player, f);
        const onCombat = Object.getOwnPropertyDescriptor(s.combat, f);
        return !onPlayer || typeof onPlayer.get === 'function' || !!onCombat;
      });
      return { pass: bad.length === 0, bad };
    });
    record('P1G-V-ROUNDTRIP-01', 'Every scalar batch-3 field reads back exactly what was written through the alias', () => {
      const s = makeWarrior();
      BATCH3_SCALAR_FIELDS.forEach((f, i) => { s.combat.player[f] = i + 1; });
      const bad = BATCH3_SCALAR_FIELDS.filter((f, i) => s.combat.player[f] !== i + 1);
      return { pass: bad.length === 0, bad };
    });
    record('P1G-V-ISOLATION-01', "A fresh fight doesn't inherit batch-3 values set on a previous one", () => {
      const s = makeWarrior();
      s.combat.player.livingSteelBonus = 5;
      s.combat.player.groundbreakerDebuffs = [{ enemy: {}, amount: 10, turnsLeft: 2 }];
      startCombat(s, 'stoneback_beetle', 25);
      return { pass: !s.combat.player.livingSteelBonus && (s.combat.player.groundbreakerDebuffs || []).length === 0, livingSteelBonus: s.combat.player.livingSteelBonus, groundbreakerDebuffs: s.combat.player.groundbreakerDebuffs };
    });

    // groundbreakerDebuffs specifically: the one array field in this
    // batch, exercised through its real push (applyGroundbreakerAccuracyDebuff)
    // and filter (tickGroundbreakerDebuffs) call sites -- confirming the
    // accessor's get() returning the live array reference still lets
    // in-place mutation and reassignment both work correctly.
    record('P1G-V-MECHANIC-GROUNDBREAKERDEBUFF-01', "groundbreakerDebuffs: applyGroundbreakerAccuracyDebuff still pushes onto it, and tickGroundbreakerDebuffs still expires an entry after its own duration, through the real call sites", () => {
      const s = makeWarrior();
      const enemyRecord = s.combat.enemies[0];
      enemyRecord.creatureObj.acc = 20; // comfortably above the debuff amount, so the floor clamp at 0 never kicks in and muddies this round-trip check
      const baseAcc = enemyRecord.creatureObj.acc;
      applyGroundbreakerAccuracyDebuff(s, enemyRecord, 2, 1);
      const afterApply = s.combat.player.groundbreakerDebuffs.length === 1 && enemyRecord.creatureObj.acc === baseAcc - 2;
      tickGroundbreakerDebuffs(s); // turnsLeft 1 -> 0, expires and restores
      const afterTick = s.combat.player.groundbreakerDebuffs.length === 0 && enemyRecord.creatureObj.acc === baseAcc;
      return { pass: afterApply && afterTick, afterApply, afterTick, baseAcc, accNow: enemyRecord.creatureObj.acc, debuffs: s.combat.player.groundbreakerDebuffs };
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
