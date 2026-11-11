// Step 1f-iii §4 (completed after 1f-iv, found while scoping audit rule
// P1): the PLAYER's own Riposte, countering an ENEMY -- the one
// direction the handoff's reaction list named (maybeRiposte, alongside
// riposteCounterOnPlayer/riposteCounterByAllyOnEnemy/
// riposteCounterByEnemyOnAlly/arenaRiposteCounterOnPlayer) that the rest
// of 1f-iii's own work never actually touched. No kept Legacy oracle for
// this one either (maybeRiposte was never duplicated -- it's a single
// shared function every caller, old and new, has always called), so
// this suite pins the new pipeline path against hand-computed expected
// values, same convention as phase1_step1f_iv_ticks_pipeline_parity.js.
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
    function withForcedHit(fn) {
      const oc = window.attackConnects;
      window.attackConnects = () => true;
      try { return fn(); } finally { window.attackConnects = oc; }
    }
    function withForcedMiss(fn) {
      const oc = window.attackConnects;
      window.attackConnects = () => false;
      try { return fn(); } finally { window.attackConnects = oc; }
    }

    function makeWarrior() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      return s;
    }

    record('P1F-MAYBERIPOSTE-NOEFFECT-01', 'No Riposte equipped: maybeRiposte is a no-op, same as always', () => {
      const s = makeWarrior();
      const creature = s.combat.enemies[0].creatureObj;
      const lines = maybeRiposte(s, creature);
      return { pass: Array.isArray(lines) && lines.length === 0, lines };
    });

    record('P1F-MAYBERIPOSTE-ALREADYDEAD-01', 'The active enemy is already at 0 HP: maybeRiposte is a no-op (never fires a free hit on a corpse)', () => {
      const origHasEffect = window.hasEffect;
      window.hasEffect = (obj, id) => id === 'riposte' ? true : origHasEffect(obj, id);
      let lines;
      try {
        const s = makeWarrior();
        const e = s.combat.enemies[0];
        e.hp = 0;
        lines = maybeRiposte(s, e.creatureObj);
      } finally {
        window.hasEffect = origHasEffect;
      }
      return { pass: Array.isArray(lines) && lines.length === 0, lines };
    });

    record('P1F-MAYBERIPOSTE-MISS-01', 'Riposte equipped, forced miss: the exact original miss line, no HP change, through rollToHitPlayerActor unchanged', () => {
      const origHasEffect = window.hasEffect;
      window.hasEffect = (obj, id) => id === 'riposte' ? true : origHasEffect(obj, id);
      let lines, hpBefore, hpAfter;
      try {
        const s = makeWarrior();
        const e = s.combat.enemies[0];
        hpBefore = e.hp;
        lines = withForcedMiss(() => maybeRiposte(s, e.creatureObj));
        hpAfter = e.hp;
      } finally {
        window.hasEffect = origHasEffect;
      }
      return { pass: hpAfter === hpBefore && lines.length === 1 && /doesn't land/.test(lines[0]), lines, hpBefore, hpAfter };
    });

    record('P1F-MAYBERIPOSTE-BASIC-01', 'Riposte equipped, forced hit: damage matches rollPlayerDamage(state, creature) * riposteMultiplier(state) * clashMult exactly, on the identical RNG sequence', () => {
      const origHasEffect = window.hasEffect;
      window.hasEffect = (obj, id) => id === 'riposte' ? true : origHasEffect(obj, id);
      const origRandom = Math.random;
      let dealt, expected, lines;
      try {
        Math.random = () => 0.3;
        const s = makeWarrior();
        const e = s.combat.enemies[0];
        const expectedRoll = rollPlayerDamage(s, e.creatureObj); // consumes the SAME forced-constant RNG; separate creature instance below keeps this isolated from the real call
        expected = Math.round(expectedRoll * riposteMultiplier(s) * 1);

        const s2 = makeWarrior();
        const e2 = s2.combat.enemies[0];
        const hpBefore = e2.hp;
        lines = withForcedHit(() => maybeRiposte(s2, e2.creatureObj));
        dealt = hpBefore - e2.hp;
      } finally {
        Math.random = origRandom;
        window.hasEffect = origHasEffect;
      }
      return { pass: dealt === expected && lines.some((l) => /seize the opening/.test(l)), dealt, expected, lines };
    });

    record('P1F-MAYBERIPOSTE-CLASH-01', 'Clash of Steel: +50% to Riposte\'s own damage specifically, via riposteCounterPlayer\'s own formula', () => {
      const origHasEffect = window.hasEffect;
      window.hasEffect = (obj, id) => (id === 'riposte' || id === 'clash_of_steel') ? true : origHasEffect(obj, id);
      const origRandom = Math.random;
      let dealt, expected;
      try {
        Math.random = () => 0.3;
        const s = makeWarrior();
        const e = s.combat.enemies[0];
        const expectedRoll = rollPlayerDamage(s, e.creatureObj);
        expected = Math.round(expectedRoll * riposteMultiplier(s) * 1.5);

        const s2 = makeWarrior();
        const e2 = s2.combat.enemies[0];
        const hpBefore = e2.hp;
        withForcedHit(() => maybeRiposte(s2, e2.creatureObj));
        dealt = hpBefore - e2.hp;
      } finally {
        Math.random = origRandom;
        window.hasEffect = origHasEffect;
      }
      return { pass: dealt === expected, dealt, expected };
    });

    record('P1F-MAYBERIPOSTE-WHITEWATCH-01', 'White Watch 4pc raises the multiplier to 0.75x (riposteMultiplier itself, unaffected by this migration) and 6pc grants a stacking Defense bonus on every successful fire', () => {
      const origHasEffect = window.hasEffect;
      const origHasSetTier = window.hasSetTier;
      window.hasEffect = (obj, id) => id === 'riposte' ? true : origHasEffect(obj, id);
      window.hasSetTier = (obj, setName, tier) => setName === 'White Watch' ? true : origHasSetTier(obj, setName, tier);
      const origRandom = Math.random;
      let dealt, expected, bonusBefore, bonusAfter;
      try {
        Math.random = () => 0.3;
        const s = makeWarrior();
        const e = s.combat.enemies[0];
        const expectedRoll = rollPlayerDamage(s, e.creatureObj);
        expected = Math.round(expectedRoll * 0.75 * 1);

        const s2 = makeWarrior();
        const e2 = s2.combat.enemies[0];
        bonusBefore = s2.combat.whiteWatchRiposteDefBonus || 0;
        const hpBefore = e2.hp;
        withForcedHit(() => maybeRiposte(s2, e2.creatureObj));
        dealt = hpBefore - e2.hp;
        bonusAfter = s2.combat.whiteWatchRiposteDefBonus || 0;
      } finally {
        Math.random = origRandom;
        window.hasEffect = origHasEffect;
        window.hasSetTier = origHasSetTier;
      }
      return { pass: dealt === expected && bonusAfter === bonusBefore + 2, dealt, expected, bonusBefore, bonusAfter };
    });

    record('P1F-MAYBERIPOSTE-KILL-01', 'A lethal riposte resolves the kill via plain resolveKill (no activeIndex redirect needed -- the target is always the currently-active enemy)', () => {
      const origHasEffect = window.hasEffect;
      window.hasEffect = (obj, id) => id === 'riposte' ? true : origHasEffect(obj, id);
      let lines, alive;
      try {
        const s = makeWarrior();
        const e = s.combat.enemies[0];
        e.hp = 1;
        lines = withForcedHit(() => maybeRiposte(s, e.creatureObj));
        alive = e.alive;
      } finally {
        window.hasEffect = origHasEffect;
      }
      return { pass: alive === false, alive, lines };
    });

    record('P1F-MAYBERIPOSTE-NO-ELEMENT-ARG-01', 'Matches the original\'s own call shape: rollPlayerDamage is called with NO activeElement, even for a mage -- a mage riposte is always reported as physical', () => {
      const origHasEffect = window.hasEffect;
      window.hasEffect = (obj, id) => id === 'riposte' ? true : origHasEffect(obj, id);
      let lastDamageType;
      try {
        const s = makeWarrior();
        s.flags.isMage = true;
        s.primaryElement = 'fire';
        const e = s.combat.enemies[0];
        withForcedHit(() => maybeRiposte(s, e.creatureObj));
        lastDamageType = e.lastDamageType;
      } finally {
        window.hasEffect = origHasEffect;
      }
      return { pass: lastDamageType === 'physical', lastDamageType };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`Step 1f-iii §4 player-Riposte-vs-enemy pipeline parity: ${out.summary.passed}/${out.summary.total} passed`);
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
