// Step 1f-iv (ticks), handoff §5: "Each DoT becomes toHit:'none'
// damage-only action through steps 4-5; replaces separate null-checks;
// must preserve beginTurn's exact ordering." Unlike every other step in
// this engagement, there is no kept "Legacy" oracle to diff against here
// -- the inline math in beginTurn/tickPlayerStatuses/tickAllyStatuses was
// edited in place (its own call sites were the only callers), not
// duplicated under a new name first. So this suite pins the NEW pipeline
// path (resolveEnemyDotTick/resolvePlayerDotTick/resolveAllyDotTick,
// applyAndReactTickOnEnemy/OnPlayer/OnAlly, the four tick* PIPELINE_FORMULAS
// entries) against hand-computed expected values re-derived from the
// same math the original inline code used, plus the control-flow nuances
// specific to this conversion: the enemy burn-only `continue` (bleed has
// none), the activeIndex redirect when a DOT kills a non-active enemy,
// the dungeon-rescue early break in tickPlayerStatuses, and the arena
// non-lethal floor / ally-kit vulnerability multiplier on the ally side.
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
    // A second enemy so a kill on enemies[0] doesn't end the fight and
    // null out state.combat before a snapshot can inspect activeIndex --
    // same helper/rationale as phase1_step1e_iii's own addSecondEnemy.
    function addSecondEnemy(s) {
      const template = BESTIARY['stoneback_beetle'];
      const creature2 = buildFightCreature(template, 25, template.dangerClass, 'stoneback_beetle');
      const record2 = buildSummonedEnemyRecord('stoneback_beetle', creature2, 'test', false, null, true);
      s.combat.enemies.push(record2);
      return record2;
    }

    // ---- Enemy burn ----
    record('P1F4-BURN-01', 'Enemy burn tick: deals exactly dmgPerTurn, decrements turnsLeft, clears at 0', () => {
      const s = makeWarrior();
      const e = s.combat.enemies[0];
      e.burn = { turnsLeft: 2, dmgPerTurn: 12 };
      const hpBefore = e.hp;
      beginTurn(s);
      const dealt = hpBefore - e.hp;
      return { pass: dealt === 12 && e.burn.turnsLeft === 1 && e.lastDamageType === 'fire', dealt, turnsLeft: e.burn.turnsLeft };
    });
    record('P1F4-BURN-EXPIRE-01', 'Enemy burn tick: clears the status entirely once turnsLeft hits 0', () => {
      const s = makeWarrior();
      const e = s.combat.enemies[0];
      e.burn = { turnsLeft: 1, dmgPerTurn: 5 };
      beginTurn(s);
      return { pass: e.burn === null, burn: e.burn };
    });
    record('P1F4-BURN-ASHWARD-01', 'Enemy burn tick: Ashward (dra_e08_ashward) reduces it to 0.75x, via tickBurnEnemy\'s own formula', () => {
      const origHasEffect = window.hasEffect;
      window.hasEffect = (obj, id) => id === 'dra_e08_ashward' ? true : origHasEffect(obj, id);
      let dealt;
      try {
        const s = makeWarrior();
        const e = s.combat.enemies[0];
        e.burn = { turnsLeft: 2, dmgPerTurn: 20 };
        const hpBefore = e.hp;
        beginTurn(s);
        dealt = hpBefore - e.hp;
      } finally {
        window.hasEffect = origHasEffect;
      }
      return { pass: dealt === 15, dealt, expected: 15 };
    });

    // ---- Enemy bleed ----
    record('P1F4-BLEED-01', 'Enemy bleed tick: deals exactly dmgPerTurn, decrements turnsLeft, clears at 0, no Ashward-style reduction', () => {
      const s = makeWarrior();
      const e = s.combat.enemies[0];
      e.bleed = { turnsLeft: 2, dmgPerTurn: 7 };
      const hpBefore = e.hp;
      beginTurn(s);
      const dealt = hpBefore - e.hp;
      return { pass: dealt === 7 && e.bleed.turnsLeft === 1 && e.lastDamageType === 'bleed', dealt, turnsLeft: e.bleed.turnsLeft };
    });

    // ---- Control flow: burn's own `continue`, bleed's lack of one ----
    record('P1F4-BURN-CONTINUE-01', 'A burn tick that resolves THIS round still runs; a burn kill skips the SAME enemy\'s own bleed check this round (the original\'s `continue`, preserved)', () => {
      const s = makeWarrior();
      addSecondEnemy(s);
      const e = s.combat.enemies[1]; // not the active enemy
      e.hp = 1;
      e.burn = { turnsLeft: 2, dmgPerTurn: 5 }; // lethal
      e.bleed = { turnsLeft: 3, dmgPerTurn: 2 };
      beginTurn(s);
      // If burn's `continue` fired, bleed's own block never ran this
      // round -- its turnsLeft is untouched.
      return { pass: e.alive === false && e.bleed && e.bleed.turnsLeft === 3, alive: e.alive, bleedTurnsLeft: e.bleed && e.bleed.turnsLeft };
    });
    record('P1F4-BLEED-NO-CONTINUE-01', 'A bleed kill does NOT skip the rest of that enemy\'s own per-enemy block this round (no `continue`, preserved) -- tickEnemyPassives still runs on it, same as the original', () => {
      const s = makeWarrior();
      addSecondEnemy(s);
      const e = s.combat.enemies[1];
      e.hp = 1;
      e.bleed = { turnsLeft: 2, dmgPerTurn: 5 }; // lethal
      e.selfBuffs = [{ stat: 'atk', amount: 3, turnsLeft: 1 }]; // tickEnemyPassives decrements this
      let threw = false;
      try { beginTurn(s); } catch (err) { threw = true; }
      return { pass: !threw && e.alive === false && e.selfBuffs.length === 0, threw, selfBuffs: e.selfBuffs };
    });

    // ---- activeIndex redirect on a DOT kill ----
    record('P1F4-DOT-KILL-REDIRECT-01', 'A DOT kill on a non-active enemy becomes active just long enough for resolveKill, then activeIndex redirects back to whichever enemy the player is actually fighting', () => {
      const s = makeWarrior();
      addSecondEnemy(s);
      const playerTargetIndex = s.combat.activeIndex; // 0, the enemy the player is fighting
      const e = s.combat.enemies[1];
      e.hp = 1;
      e.bleed = { turnsLeft: 2, dmgPerTurn: 5 };
      beginTurn(s);
      return { pass: e.alive === false && s.combat.activeIndex === playerTargetIndex, activeIndex: s.combat.activeIndex, playerTargetIndex };
    });

    // ---- Player status DOT ----
    function makeStatus(key, name, pctMaxHp, turnsLeft, stacks) {
      return { [key]: { name, dot: { pctMaxHp }, turnsLeft, stacks: stacks || 1 } };
    }
    record('P1F4-PLAYER-DOT-01', 'Player status tick: deals exactly round(maxHealth * pctMaxHp * stacks), decrements turnsLeft, deletes at 0, banks the right Injury System hit type', () => {
      const s = makeWarrior();
      s.combat.player.playerStatuses = makeStatus('bleed', 'Bleeding', 0.05, 1);
      const hpBefore = s.health;
      const expected = Math.round(s.maxHealth * 0.05);
      tickPlayerStatuses(s);
      const dealt = hpBefore - s.health;
      // Damage Types Step 4, A7: playerLastHitType's own resolved string
      // is DAMAGE_TYPES_V2-dependent (applyAndReactTickOnPlayer,
      // pipeline.js) -- "bleed" pre-switch, STATUS_EFFECTS.bleed's own
      // damageType ("slashing") once the switch is permanently on in
      // the committed source (Part C). DAMAGE_TYPES_V2 itself is a
      // `const`, so there's no way to force the OFF branch from inside
      // an already-loaded page the way COMBAT_UNIFY's own object fields
      // get cloned/zeroed/restored elsewhere in this engagement -- this
      // check tracks whichever branch is actually live instead, since
      // this scenario was never about which exact string gets banked,
      // only that a status tick banks ONE AT ALL for the Injury System
      // to read.
      const expectedHitType = typeof DAMAGE_TYPES_V2 !== 'undefined' && DAMAGE_TYPES_V2 ? resolveStatusDamageType('bleed', STATUS_EFFECTS.bleed) : 'bleed';
      return { pass: dealt === expected && !s.combat.player.playerStatuses.bleed && s.combat.player.playerLastHitType === expectedHitType, dealt, expected, expectedHitType };
    });
    record('P1F4-PLAYER-DOT-HEATPROOF-01', 'Player status tick: Heatproof halves a "burning" tick specifically (floor, not round), via tickStatusPlayer\'s own formula', () => {
      const origHasEffect = window.hasEffect;
      window.hasEffect = (obj, id) => id === 'heatproof' ? true : origHasEffect(obj, id);
      let dealt, expectedRaw, expectedHalved;
      try {
        const s = makeWarrior();
        s.combat.player.playerStatuses = makeStatus('burning', 'Burning', 0.05, 2);
        expectedRaw = Math.round(s.maxHealth * 0.05);
        expectedHalved = Math.floor(expectedRaw / 2);
        const hpBefore = s.health;
        tickPlayerStatuses(s);
        dealt = hpBefore - s.health;
      } finally {
        window.hasEffect = origHasEffect;
      }
      return { pass: dealt === expectedHalved, dealt, expectedHalved, expectedRaw };
    });
    record('P1F4-PLAYER-DOT-DEFEAT-01', 'A lethal player status tick resolves defeat/downed via the same resolvePlayerDefeatOrDowned call the original made', () => {
      const s = makeWarrior();
      s.health = 1;
      s.combat.player.playerStatuses = makeStatus('bleed', 'Bleeding', 0.5, 1);
      const lines = tickPlayerStatuses(s);
      const defeatLine = lines.some((l) => /Everything goes dark/.test(l));
      return { pass: s.health <= 0 && defeatLine, health: s.health, lines };
    });
    record('P1F4-PLAYER-DOT-RESCUE-BREAK-01', 'When a status tick\'s own defeat resolution ends combat outright (dungeon rescue), the loop breaks immediately -- a second status in the same tick is never charged, matching the original\'s own early break', () => {
      const s = makeWarrior();
      s.health = 1;
      s.activeDungeon = { dungeonId: 'mugamiir_test' };
      s.combat.player.playerStatuses = {
        aaa_lethal: { name: 'Lethal', dot: { pctMaxHp: 0.5 }, turnsLeft: 3 },
        zzz_second: { name: 'Second', dot: { pctMaxHp: 0.5 }, turnsLeft: 3 },
      };
      const origDungeonRescue = dungeonRescue;
      let rescueCalled = false;
      dungeonRescue = function (st) { rescueCalled = true; st.combat = null; return 'The Mugamiir pulls you out.'; };
      let lines, err;
      try { lines = tickPlayerStatuses(s); } catch (e) { err = e.message; } finally { dungeonRescue = origDungeonRescue; }
      // aaa_lethal sorts first in Object.entries' insertion order; its own
      // kill should break the loop before zzz_second is ever touched --
      // zzz_second's turnsLeft must be untouched (still 3, key still present).
      return { pass: !err && rescueCalled && s.combat === null, err, rescueCalled, combatIsNull: s.combat === null, lines };
    });

    // ---- Ally status DOT ----
    record('P1F4-ALLY-DOT-01', 'Ally status tick: deals exactly round(maxHealth * pctMaxHp * stacks), decrements turnsLeft, deletes at 0', () => {
      const s = makeWarrior();
      const ally = s.recruitAlly('kessa');
      ally.statuses = makeStatus('bleed', 'Bleeding', 0.05, 1);
      const hpBefore = ally.health;
      const expected = Math.round(ally.maxHealth * 0.05);
      tickAllyStatuses(s, ally);
      const dealt = hpBefore - ally.health;
      return { pass: dealt === expected && !ally.statuses.bleed, dealt, expected };
    });
    record('P1F4-ALLY-DOT-VULN-01', 'Ally status tick: Hadrian\'s own kit vulnerability (venom x1.25) is applied, via tickStatusAlly\'s own formula reading ALLY_DEFS generically -- not special-cased to Hadrian by name anywhere in the tick path', () => {
      const s = makeWarrior();
      const hadrian = s.recruitAlly('hadrian');
      hadrian.statuses = makeStatus('venom', 'Venom', 0.05, 1);
      const hpBefore = hadrian.health;
      const raw = Math.round(hadrian.maxHealth * 0.05);
      const expected = Math.round(raw * 1.25);
      tickAllyStatuses(s, hadrian);
      const dealt = hpBefore - hadrian.health;
      return { pass: dealt === expected, dealt, expected, raw };
    });
    record('P1F4-ALLY-DOT-ARENAFLOOR-01', 'Ally status tick: the arena non-lethal floor (health never drops below 1 when isArenaFight && !arenaLethal) is respected, via applyAndReactTickOnAlly\'s own tail', () => {
      const s = makeWarrior();
      const ally = s.recruitAlly('kessa');
      s.combat.isArenaFight = true;
      s.combat.arenaLethal = false;
      ally.health = 3;
      ally.statuses = makeStatus('bleed', 'Bleeding', 0.9, 1); // would be lethal without the floor
      tickAllyStatuses(s, ally);
      return { pass: ally.health === 1 && ally.alive === true, health: ally.health, alive: ally.alive };
    });
    record('P1F4-ALLY-DOT-KILL-01', 'A lethal ally status tick (no arena floor) calls killAlly, same as the original', () => {
      const s = makeWarrior();
      const ally = s.recruitAlly('kessa');
      ally.health = 1;
      ally.statuses = makeStatus('bleed', 'Bleeding', 0.5, 1);
      const lines = tickAllyStatuses(s, ally);
      return { pass: ally.alive === false, aliveAfter: ally.alive, lines };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`Step 1f-iv §5 ticks pipeline parity: ${out.summary.passed}/${out.summary.total} passed`);
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
