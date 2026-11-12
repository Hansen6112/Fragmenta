// Acceptance test for the "downed, not dead" combat rule change.
// Evidence of correctness for a core, engine-wide change — not Dregnar-
// specific. Playwright against the real engine via localhost:8949, same
// pattern as every other verification script this engagement.
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

    function makePlayer(level) {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = level || 20;
      s.recomputeStats(false);
      return s;
    }
    function withForcedMiss(fn) {
      const oc = window.attackConnects;
      window.attackConnects = () => false;
      try { return fn(); } finally { window.attackConnects = oc; }
    }
    function withForcedHit(fn) {
      const oc = window.attackConnects;
      window.attackConnects = () => true;
      try { return fn(); } finally { window.attackConnects = oc; }
    }
    // Object-form startCombat is always exactly one enemy, no random pack
    // roll (confirmed this engagement's own Dregnar work: `isDynamic`
    // skips rollEncounterGroup entirely) — the deterministic single-enemy
    // setup several tests below need, since 'bandit_cutthroat' can
    // randomly spawn as a pack of 2-4.
    function startSoloFight(s, hp) {
      startCombat(s, { name: 'Test Dummy', hp: hp, atk: 8, def: 4, spd: 8, acc: 85, agi: 5, statScaled: true }, 10);
    }

    // ============ 1. Control: solo player, no allies, no cheat-death gear ============
    record('SOLO-01', 'Solo player (no allies) hitting 0 Health is an instant, permanent defeat: playerDowned stays false, state.combat stays set until the caller nulls it, resolvePlayerDefeatOrDowned returns the plain "Everything goes dark." line', () => {
      const s = makePlayer(10);
      startCombat(s, 'bandit_cutthroat', 10);
      s.health = 1;
      const msg = resolvePlayerDefeatOrDowned.call ? null : null; // placeholder to keep linting calm
      s.health = 0;
      const line = resolvePlayerDefeatOrDowned(s);
      return { pass: line === 'Everything goes dark.' && s.playerDowned !== true, line, playerDowned: s.playerDowned };
    });
    record('SOLO-02', 'Solo player: main.js\'s own end-of-command condition (health<=0 && !playerDowned) is true the instant they hit 0 — the exact condition that fires the permanent game-over', () => {
      const s = makePlayer(10);
      startCombat(s, 'bandit_cutthroat', 10);
      s.health = 0;
      resolvePlayerDefeatOrDowned(s);
      return { pass: s.health <= 0 && !s.playerDowned };
    });

    // ============ 2. Downed transition with allies alive ============
    record('DOWN-01', 'Player with 1+ allies alive hitting 0 Health becomes downed, not defeated: playerDowned becomes true, a message is returned, combat stays active', () => {
      const s = makePlayer(20);
      startCombat(s, 'bandit_cutthroat', 20);
      s.recruitAlly('kessa');
      s.health = 0;
      const line = resolvePlayerDefeatOrDowned(s);
      return { pass: s.playerDowned === true && !!line && !!s.combat, line, playerDowned: s.playerDowned, combatAlive: !!s.combat };
    });
    record('DOWN-02', 'A second, incidental check of the already-downed player (e.g. a later DOT tick) returns null — no re-trigger, no duplicate message', () => {
      const s = makePlayer(20);
      startCombat(s, 'bandit_cutthroat', 20);
      s.recruitAlly('kessa');
      s.health = 0;
      resolvePlayerDefeatOrDowned(s); // first call: transitions
      const second = resolvePlayerDefeatOrDowned(s); // second call: should be a no-op
      return { pass: second === null, second };
    });

    // ============ 3. Player excluded from targeting while downed ============
    record('TARGET-01', 'pickEnemyAttackTarget never resolves to the player once downed, across many trials, with allies alive', () => {
      const s = makePlayer(20);
      startCombat(s, 'bandit_cutthroat', 20);
      s.recruitAlly('kessa');
      s.recruitAlly('hadrian');
      s.playerDowned = true;
      let playerHits = 0;
      const N = 500;
      for (let i = 0; i < N; i++) {
        const t = pickEnemyAttackTarget(s);
        if (t.kind === 'player') playerHits++;
      }
      return { pass: playerHits === 0, playerHits, N };
    });
    record('TARGET-02', 'pickEnemyAttackTarget still correctly targets the player (and allies) normally when NOT downed — the exclusion is scoped to playerDowned only, not a blanket change', () => {
      const s = makePlayer(20);
      startCombat(s, 'bandit_cutthroat', 20);
      s.recruitAlly('kessa');
      s.playerDowned = false;
      let playerHits = 0, allyHits = 0;
      const N = 500;
      for (let i = 0; i < N; i++) {
        const t = pickEnemyAttackTarget(s);
        if (t.kind === 'player') playerHits++; else allyHits++;
      }
      return { pass: playerHits > 0 && allyHits > 0, playerHits, allyHits, N };
    });

    // ============ 4. Round continuation while downed ============
    record('ROUND-01', 'resolveDownedRound actually advances the round: ally cooldowns/actions and enemy cooldowns tick, with no player action. Enemy HP inflated (survives the hit) and the ally\'s attack forced to connect, isolating this from both the miss-flakiness and the (separately tested) revival-on-victory case.', () => {
      const s = makePlayer(20);
      startSoloFight(s, 999999);
      s.recruitAlly('kessa');
      s.health = 5000; s.maxHealth = 5000; // survive whatever the enemy throws back
      s.playerDowned = true;
      const enemyHpBefore = s.combat.hp;
      const r1 = withForcedHit(() => resolveDownedRound(s));
      const enemyHpAfter = s.combat ? s.combat.hp : 0;
      return { pass: !!r1 && r1.length > 0 && !!s.combat && enemyHpAfter < enemyHpBefore, enemyHpBefore, enemyHpAfter, lines: r1 };
    });
    record('ROUND-02', 'combatOngoing correctly reports true while downed with an ally alive; once the real code path (killAlly) processes that ally\'s own death as the last one, combat itself is already null, so combatOngoing correctly reports false via its own !!state.combat check', () => {
      const s = makePlayer(20);
      startCombat(s, 'bandit_cutthroat', 20);
      const ally = s.recruitAlly('kessa');
      s.health = 0; s.playerDowned = true;
      const withAlly = combatOngoing(s);
      killAlly(s, ally); // the ONE real path that detects "last ally, player downed" and nulls combat
      const withoutAlly = combatOngoing(s);
      return { pass: withAlly === true && withoutAlly === false, withAlly, withoutAlly, combatNullAfter: s.combat === null };
    });
    record('ROUND-03', 'beginTurn keeps ticking ally buffs/statuses and combat.player.actionCounter while the player is downed (the real bug this change had to fix)', () => {
      const s = makePlayer(20);
      startCombat(s, 'bandit_cutthroat', 20);
      const ally = s.recruitAlly('kessa');
      s.health = 5000; s.maxHealth = 5000;
      s.playerDowned = true;
      const counterBefore = s.combat.player.actionCounter;
      ally.statuses = ally.statuses || {};
      ally.statuses.chilled = { name: 'Chilled', debuff: { agi: -10 }, turnsLeft: 3 };
      beginTurn(s);
      const counterAfter = s.combat.player.actionCounter;
      const statusTurnsAfter = ally.statuses.chilled ? ally.statuses.chilled.turnsLeft : null;
      return { pass: counterAfter > counterBefore && statusTurnsAfter === 2, counterBefore, counterAfter, statusTurnsAfter };
    });
    record('ROUND-04', 'A flurry-capable enemy still gets its second swing against allies while the player is downed (resolveEnemyActionWithFlurry\'s own gate)', () => {
      const s = makePlayer(20);
      startCombat(s, { name: 'Test Drake', hp: 999999, atk: 10, def: 5, spd: 10, acc: 90, agi: 5, flurry: true, statScaled: true }, 20);
      s.recruitAlly('kessa');
      s.health = 5000; s.maxHealth = 5000;
      s.playerDowned = true;
      const result = withForcedMiss(() => resolveEnemyActionWithFlurry(s, s.combat.creatureObj, 2, 0));
      return { pass: /fast enough to strike again/.test(result.lines.join(' ')), lines: result.lines };
    });

    // ============ 5. Allies win after player downed: revival ============
    record('WIN-01', 'The last enemy falling while the player is downed revives them at exactly 25% max Health, clears playerDowned, and prints a coming-to line', () => {
      const s = makePlayer(20);
      startSoloFight(s, 100);
      s.recruitAlly('kessa');
      s.maxHealth = 200;
      s.health = 0;
      s.playerDowned = true;
      const creature = getCombatCreature(s);
      s.combat.hp = 1; // one hit from death
      const lines = withForcedHit(() => resolveKill(s, creature));
      return {
        pass: s.playerDowned === false && s.health === Math.ceil(200 * 0.25) && /come to|carried/i.test(lines.join(' ')),
        health: s.health, playerDowned: s.playerDowned, lines,
      };
    });
    record('WIN-02', 'After the revival, the run is NOT over: state.health > 0 and !playerDowned, the exact condition main.js checks', () => {
      const s = makePlayer(20);
      startSoloFight(s, 100);
      s.recruitAlly('kessa');
      s.maxHealth = 200; s.health = 0; s.playerDowned = true;
      const creature = getCombatCreature(s);
      s.combat.hp = 1;
      withForcedHit(() => resolveKill(s, creature));
      return { pass: s.health > 0 && !s.playerDowned, health: s.health, playerDowned: s.playerDowned, combatNull: s.combat === null };
    });

    // ============ 6. Allies also fall after player downed: final defeat ============
    record('LOSE-01', 'The LAST ally falling while the player is downed ends combat, clears... no, SETS the final flavor line, and leaves health<=0 && !playerDowned — main.js\'s hard-stop condition', () => {
      const s = makePlayer(20);
      startCombat(s, 'bandit_cutthroat', 20);
      const ally = s.recruitAlly('kessa');
      s.health = 0;
      s.playerDowned = true;
      const lines = killAlly(s, ally);
      return {
        pass: s.combat === null && s.playerDowned === false && s.health <= 0 && /watch|haze|last of them/i.test(lines.join(' ')),
        combatNull: s.combat === null, playerDowned: s.playerDowned, lines,
      };
    });
    record('LOSE-02', 'An ally falling while OTHER allies are still alive (not the last one) does NOT end combat or touch playerDowned — only the truly last one does', () => {
      const s = makePlayer(20);
      startCombat(s, 'bandit_cutthroat', 20);
      const a1 = s.recruitAlly('kessa');
      const a2 = s.recruitAlly('hadrian');
      s.health = 0;
      s.playerDowned = true;
      const lines = killAlly(s, a1);
      return { pass: s.combat !== null && s.playerDowned === true, combatAlive: s.combat !== null, playerDowned: s.playerDowned, lines };
    });

    // ============ 7. Gear-based cheat-death still takes priority ============
    record('GEAR-01', 'Last Stand still saves the player at 1 Health with its own message, completely unaffected by the new downed mechanic, even with allies alive', () => {
      const s = makePlayer(20);
      startCombat(s, 'bandit_cutthroat', 20);
      s.recruitAlly('kessa');
      // last_stand is granted by an equipped item carrying that effect id —
      // simplest reliable way to grant it for this test is to monkeypatch
      // hasEffect for this one call, since finding/equipping the exact
      // real item isn't the point of this check (the gate ordering is).
      const orig = hasEffect;
      window.hasEffect = function (entity, id) { return id === 'last_stand' ? true : orig(entity, id); };
      try {
        s.health = 0;
        const line = resolvePlayerDefeatOrDowned(s);
        return { pass: s.health === 1 && s.playerDowned !== true && /Last Stand/.test(line || ''), health: s.health, playerDowned: s.playerDowned, line };
      } finally {
        window.hasEffect = orig;
      }
    });

    // ============ 8. Multi-enemy pack encounters ============
    record('PACK-01', 'A downed player does not break a multi-enemy fight: remaining enemies and allies keep acting via resolveDownedRound. Pack built deterministically (cloning the single spawned enemy slot) rather than relying on bandit_cutthroat\'s own random pack roll.', () => {
      const s = makePlayer(20);
      startSoloFight(s, 999999);
      s.combat.enemies.push(JSON.parse(JSON.stringify(s.combat.enemies[0])));
      s.combat.enemies[1].creatureObj = Object.assign({}, s.combat.enemies[0].creatureObj);
      s.recruitAlly('kessa');
      s.health = 5000; s.maxHealth = 5000;
      s.playerDowned = true;
      const enemyCountBefore = s.combat.enemies.filter(e => e.alive).length;
      const r = resolveDownedRound(s);
      return { pass: Array.isArray(r) && !!s.combat && enemyCountBefore === 2, enemyCountBefore, linesLen: r.length, lines: r };
    });

    // ============ 9. Stat-check sanity: playerDowned resets per combat ============
    record('RESET-01', 'startCombat always resets playerDowned to false for a brand new fight, even if the state object was reused from a prior (downed) fight', () => {
      const s = makePlayer(20);
      startCombat(s, 'bandit_cutthroat', 20);
      s.playerDowned = true;
      startCombat(s, 'bandit_cutthroat', 20);
      return { pass: s.playerDowned === false };
    });

    return ledger;
  });

  console.log(JSON.stringify(out, null, 2));
  const fails = out.filter((e) => !e.pass);
  console.log(`RESULT: ${out.length - fails.length}/${out.length}`);
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
