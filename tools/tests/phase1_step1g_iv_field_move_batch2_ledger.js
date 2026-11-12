// Step 1g-iv: batch 2 of the 117-field move -- the 21 remaining avatarOf*
// fields (Turns/AtkBonus/DefBonus/MagicBonus/KnowledgeBonus/Stacks/SaveUsed
// -- the *Used flags already moved in 1e) moved into the player's own
// private store, same PLAYER_FIELDS/wirePlayerFieldsProxy mechanism as
// batch 1. Same proof shape as phase1_step1g_iii_field_move_batch1_ledger.js:
// structural accessor/round-trip/isolation checks, plus a real mechanic
// (applyHeal's own Avatar of Endurance/Devotion healing-bonus reads)
// exercised end to end through the live pipeline.
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
      startCombat(s, 'stoneback_beetle', 25);
      return s;
    }

    const BATCH2_FIELDS = [
      'avatarOfChaosAtkBonus', 'avatarOfChaosDefBonus', 'avatarOfChaosKnowledgeBonus',
      'avatarOfChaosMagicBonus', 'avatarOfChaosTurns',
      'avatarOfCreationAtkStacks', 'avatarOfCreationMagicStacks', 'avatarOfCreationTurns',
      'avatarOfDevotionSaveUsed', 'avatarOfDevotionTurns',
      'avatarOfEnduranceAtkBonus', 'avatarOfEnduranceDefBonus', 'avatarOfEnduranceTurns',
      'avatarOfFateSaveUsed', 'avatarOfFateTurns',
      'avatarOfFreedomTurns', 'avatarOfKnowledgeTurns', 'avatarOfPassingTurns',
      'avatarOfRenewalTurns', 'avatarOfTimeTurns', 'avatarOfWarTurns',
    ];

    record('P1G-IV-ACCESSOR-01', 'All 21 batch-2 avatarOf* fields live as plain data properties on combat.player and nowhere on combat itself -- step 1h-iii deleted the accessor alias once every call site moved onto combat.player', () => {
      const s = makeWarrior();
      const bad = BATCH2_FIELDS.filter((f) => {
        const onPlayer = Object.getOwnPropertyDescriptor(s.combat.player, f);
        const onCombat = Object.getOwnPropertyDescriptor(s.combat, f);
        return !onPlayer || typeof onPlayer.get === 'function' || !!onCombat;
      });
      return { pass: bad.length === 0, bad };
    });
    record('P1G-IV-ROUNDTRIP-01', 'Every batch-2 field reads back exactly what was written through the alias', () => {
      const s = makeWarrior();
      BATCH2_FIELDS.forEach((f, i) => { s.combat.player[f] = i + 1; });
      const bad = BATCH2_FIELDS.filter((f, i) => s.combat.player[f] !== i + 1);
      return { pass: bad.length === 0, bad };
    });
    record('P1G-IV-ISOLATION-01', "A fresh fight doesn't inherit a batch-2 value set on a previous one", () => {
      const s = makeWarrior();
      s.combat.player.avatarOfEnduranceTurns = 4;
      s.combat.player.avatarOfChaosAtkBonus = 7;
      startCombat(s, 'stoneback_beetle', 25);
      return { pass: s.combat.player.avatarOfEnduranceTurns === 0 && !s.combat.player.avatarOfChaosAtkBonus, avatarOfEnduranceTurns: s.combat.player.avatarOfEnduranceTurns, avatarOfChaosAtkBonus: s.combat.player.avatarOfChaosAtkBonus };
    });

    // Real mechanic: applyHeal's own Avatar of Endurance (+50%) and Avatar
    // of Devotion (x2, stacking multiplicatively on top) healing bonuses,
    // both read directly off combat.avatarOf*Turns from deep inside the
    // live applyHeal function -- proving the alias survives that real
    // call site, not just the accessor's own plumbing.
    record('P1G-IV-MECHANIC-ENDURANCE-01', 'Avatar of Endurance (avatarOfEnduranceTurns > 0) still grants +50% healing through the real applyHeal path', () => {
      const s = makeWarrior();
      s.health = 10;
      s.combat.player.avatarOfEnduranceTurns = 3;
      const { healed } = applyHeal(s, 10);
      return { pass: healed === 15, healed };
    });
    record('P1G-IV-MECHANIC-DEVOTION-01', 'Avatar of Devotion (avatarOfDevotionTurns > 0) still doubles healing, stacking multiplicatively with Avatar of Endurance, through the real applyHeal path', () => {
      const s = makeWarrior();
      s.health = 10;
      s.combat.player.avatarOfDevotionTurns = 2;
      s.combat.player.avatarOfEnduranceTurns = 3;
      const { healed } = applyHeal(s, 10);
      return { pass: healed === 30, healed }; // 10 * 2 (devotion) * 1.5 (endurance) = 30
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
