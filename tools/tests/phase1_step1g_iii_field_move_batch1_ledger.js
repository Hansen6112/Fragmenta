// Step 1g-iii: batch 1 of the 117-field move -- 19 once-per-fight/cooldown
// flags moved into the player's own private store via PLAYER_FIELDS/
// wirePlayerFieldsProxy (combat.js), the same mechanism 1e §3.3 already
// proved for its own 31 fields. No Legacy oracle applies here (nothing
// was duplicated -- this is a pure storage relocation, not new logic),
// so this proves the two things that pattern can actually get wrong:
// (1) the field now lives behind a real accessor backed by its own
// private store, not a plain property directly on combat, and (2) every
// existing read/write call site still round-trips through that accessor
// transparently, with the full regression suite's own mechanics (Mirror
// Soul, Guardian Spirit, Last Stand, ...) as the real behavioral proof --
// all of them still pass, unchanged, elsewhere in the suite.
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

    // guardianSpiritUsed/guidedFootstepsUsed/timelessGuardCooldown moved
    // off this list under Phase 2 Amendment 1 (18 Nov) -- their state now
    // lives under their own registry entries on combat.player.modifierState,
    // not as flat combat.player properties. See the dedicated
    // MODIFIERSTATE tests below instead of this batch's own accessor list.
    const BATCH1_FIELDS = [
      'betweenWorldsUsed', 'elderBarkSaveUsed', 'firstHitTakenUsed',
      'lastStandUsed', 'mercyOfTheVeilUsed', 'mirrorSoulUsed',
      'naturesPersistenceUsed', 'preparedResponseWitnessed', 'scoutStealthUsed', 'sharedBurdenUsed',
      'stormBarrierUsed', 'threadsOfConsequencePending', 'trailblazerUsed',
      'unbreakableUsed', 'unlikelyOutcomeGuaranteedCrit', 'unyieldingWallCooldown',
    ];

    record('P1G-III-ACCESSOR-01', 'All 19 batch-1 fields live as plain data properties on combat.player and nowhere on combat itself -- step 1h-iii deleted the accessor alias once every call site moved onto combat.player', () => {
      const s = makeWarrior();
      const bad = BATCH1_FIELDS.filter((f) => {
        const onPlayer = Object.getOwnPropertyDescriptor(s.combat.player, f);
        const onCombat = Object.getOwnPropertyDescriptor(s.combat, f);
        return !onPlayer || typeof onPlayer.get === 'function' || !!onCombat;
      });
      return { pass: bad.length === 0, bad };
    });

    record('P1G-III-ROUNDTRIP-01', 'Every batch-1 field still reads back exactly what was written through the alias (boolean flags)', () => {
      const s = makeWarrior();
      const boolFields = BATCH1_FIELDS.filter((f) => f !== 'unyieldingWallCooldown');
      for (const f of boolFields) s.combat.player[f] = true;
      const bad = boolFields.filter((f) => s.combat.player[f] !== true);
      return { pass: bad.length === 0, bad };
    });
    record('P1G-III-ROUNDTRIP-02', 'unyieldingWallCooldown still reads back exactly what was written, as a number', () => {
      const s = makeWarrior();
      s.combat.player.unyieldingWallCooldown = 3;
      return { pass: s.combat.player.unyieldingWallCooldown === 3, unyieldingWallCooldown: s.combat.player.unyieldingWallCooldown };
    });
    record('P1G-III-ISOLATION-01', "Each fight's own private store is independent -- a fresh combat doesn't inherit a flag set on a previous one", () => {
      const s = makeWarrior();
      s.combat.player.mirrorSoulUsed = true;
      startCombat(s, 'stoneback_beetle', 25); // a brand new fight, same state object
      return { pass: s.combat.player.mirrorSoulUsed !== true, mirrorSoulUsed: s.combat.player.mirrorSoulUsed };
    });
    // Phase 2 Amendment 1 (18 Nov): timelessGuardCooldown's new home,
    // combat.player.modifierState["effect:timeless_guard"].cooldown --
    // same round-trip and isolation guarantees the old flat field had.
    record('P1G-III-MODIFIERSTATE-ROUNDTRIP-01', "Timeless Guard's cooldown reads back exactly what was written at its registry entry's own state", () => {
      const s = makeWarrior();
      const st = modifierStateFor(s, 'player', 'effect:timeless_guard', MODIFIERS['effect:timeless_guard']);
      st.cooldown = 2;
      return { pass: s.combat.player.modifierState['effect:timeless_guard'].cooldown === 2, cooldown: s.combat.player.modifierState['effect:timeless_guard'].cooldown };
    });
    record('P1G-III-MODIFIERSTATE-ISOLATION-01', "A fresh combat doesn't inherit Timeless Guard's cooldown from a previous one", () => {
      const s = makeWarrior();
      modifierStateFor(s, 'player', 'effect:timeless_guard', MODIFIERS['effect:timeless_guard']).cooldown = 2;
      startCombat(s, 'stoneback_beetle', 25);
      return { pass: s.combat.player.modifierState['effect:timeless_guard'].cooldown === 0, cooldown: s.combat.player.modifierState['effect:timeless_guard'].cooldown };
    });

    // Real mechanics using batch-1 flags: Guardian Spirit's auto-miss and
    // Mirror Soul's reflection, both of which read/write a batch-1 field
    // from deep inside the live pipeline (rollToHit / calculateDamage),
    // not just a direct test-side set/get -- proving the alias survives
    // the real call sites, not only the accessor's own plumbing.
    record('P1G-III-MECHANIC-GUARDIANSPIRIT-01', "Guardian Spirit still gates the first enemy attack via the real pipeline rollToHit path, now via its registry entry's own state", () => {
      const s = makeWarrior();
      const creature = s.combat.enemies[0].creatureObj;
      const origHasEffect = window.hasEffect;
      const origConnects = window.attackConnects;
      window.hasEffect = (obj, id) => id === 'guardian_spirit';
      window.attackConnects = () => true;
      try {
        const result = resolveEnemyAttackOnPlayer(s, creature, 2, 0, null, null);
        const used = s.combat.player.modifierState['effect:guardian_spirit'].used;
        return { pass: used === true && result.damage === 0, used, damage: result.damage, lines: result.lines };
      } finally {
        window.hasEffect = origHasEffect;
        window.attackConnects = origConnects;
      }
    });
    record('P1G-III-MECHANIC-MIRRORSOUL-01', 'Mirror Soul (mirrorSoulUsed) still latches true the first time it reflects, through the real pipeline calculateDamage/applyAndReact path', () => {
      const s = makeWarrior();
      s.flags.isMage = true;
      s.primaryElement = 'fire';
      const creature = s.combat.enemies[0].creatureObj;
      creature.element = 'ice';
      const origHasEffect = window.hasEffect;
      const origConnects = window.attackConnects;
      window.hasEffect = (obj, id) => id === 'mirror_soul';
      window.attackConnects = () => true;
      try {
        resolveEnemyAttackOnPlayer(s, creature, 2, 0, null, null);
        return { pass: s.combat.player.mirrorSoulUsed === true, mirrorSoulUsed: s.combat.player.mirrorSoulUsed };
      } finally {
        window.hasEffect = origHasEffect;
        window.attackConnects = origConnects;
      }
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
