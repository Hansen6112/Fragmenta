// Step 1g-i: Dregnar's single-target damaging attempts (dregnarResolveDamagingAttempt)
// and every other creature's (resolveEnemyAction) now call the exact same
// extracted resolveEnemySingleTargetAttempt (combat.js) instead of each
// keeping its own private copy of the pickEnemyAttackTarget + ternary
// dispatch. A pure dedup -- no behavior change -- so this pins the one
// thing that could regress: that both callers still correctly reach the
// player when there's no one else to hit, and still correctly reach an
// ally when the targeting roll says ally, with Dregnar's own surrounding
// bonus mechanics (DRA-P03/Legacy/Black-Ice Reserve) still wrapping the
// call exactly as before. Whole-fight bit-for-bit parity against the
// pre-1g-i baseline (boss_sweep/plus3_run, including Dregnar's own rows)
// already proved no behavior changed; this adds the direct, deterministic
// check the handoff's "forced-roll parity" standard asks for.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:8949/index.html');
  await page.waitForSelector('#input');

  const out = await page.evaluate(() => {
    function makeChar(level) {
      const s = new GameState();
      s.playerName = 'T';
      s.applyCreation('human', 'human_legionary', 'warrior', {});
      if (level) { s.level = level; s.recomputeStats(false); }
      return s;
    }
    function withForcedHit(fn) {
      const oc = window.attackConnects;
      window.attackConnects = () => true;
      try { return fn(); } finally { window.attackConnects = oc; }
    }
    function freshDregnar(level) {
      const s = makeChar(level || 60);
      s.health = s.maxHealth * 1000;
      s.maxHealth = s.maxHealth * 1000;
      startCombat(s, 'dregnar_ashvein', 30);
      return s;
    }
    function freshOrdinary(level) {
      const s = makeChar(level || 30);
      s.health = s.maxHealth * 1000;
      s.maxHealth = s.maxHealth * 1000;
      startCombat(s, 'stoneback_beetle', 30);
      return s;
    }
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

    record('P1G-I-DREGNAR-PLAYER-01', 'Dregnar, zero allies: a forced-hit basic attack lands on the player (shared resolveEnemySingleTargetAttempt reaches resolveEnemyAttackOnPlayer)', () => {
      const s = freshDregnar();
      const c = s.combat.creatureObj;
      const e = s.combat.enemies[0];
      e.abilityCooldowns = { dra_barrier: 99, dra_hammerfall: 99, dra_frostbite_brand: 99, dra_cleave: 99, dra_judgment: 99 };
      const hpBefore = s.health;
      const r = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: r.damage > 0 && s.health < hpBefore, damage: r.damage, hpBefore, hpAfter: s.health };
    });

    record('P1G-I-DREGNAR-ALLY-01', 'Dregnar, player downed + exactly one alive ally: a forced-hit basic attack lands on the ally, not the player (deterministic target roll)', () => {
      const s = freshDregnar();
      const c = s.combat.creatureObj;
      const e = s.combat.enemies[0];
      e.abilityCooldowns = { dra_barrier: 99, dra_hammerfall: 99, dra_frostbite_brand: 99, dra_cleave: 99, dra_judgment: 99 };
      s.recruitAlly('kessa');
      s.playerDowned = true;
      const ally = s.party[0];
      const allyHpBefore = ally.health;
      const playerHpBefore = s.health;
      const r = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      return {
        pass: ally.health < allyHpBefore && s.health === playerHpBefore,
        damage: r.damage, allyHpBefore, allyHpAfter: ally.health, playerHpBefore, playerHpAfter: s.health,
      };
    });

    record('P1G-I-DREGNAR-BONUS-WRAP-01', "Dregnar's own DRA-P03 (+3 Attack charge) still applies and is still un-applied around the shared dispatch when the roll lands on an ally, not just the player", () => {
      const s = freshDregnar();
      const c = s.combat.creatureObj;
      const e = s.combat.enemies[0];
      e.abilityCooldowns = { dra_barrier: 99, dra_hammerfall: 99, dra_frostbite_brand: 99, dra_cleave: 99, dra_judgment: 99 };
      e.draP03Charges = 1;
      s.recruitAlly('kessa');
      s.playerDowned = true;
      const baseAtk = c.atk;
      withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: c.atk === baseAtk && e.draP03Charges === 0, atkAfter: c.atk, baseAtk, chargesAfter: e.draP03Charges };
    });

    record('P1G-I-ORDINARY-PLAYER-01', 'An ordinary (non-Dregnar) creature, zero allies: resolveEnemyAction still reaches the player through the same shared function Dregnar now uses', () => {
      const s = freshOrdinary();
      const c = s.combat.creatureObj;
      const hpBefore = s.health;
      const r = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: r.damage > 0 && s.health < hpBefore, damage: r.damage, hpBefore, hpAfter: s.health };
    });

    record('P1G-I-ORDINARY-ALLY-01', 'An ordinary creature, player downed + exactly one alive ally: resolveEnemyAction still reaches the ally through the same shared function', () => {
      const s = freshOrdinary();
      const c = s.combat.creatureObj;
      s.recruitAlly('kessa');
      s.playerDowned = true;
      const ally = s.party[0];
      const allyHpBefore = ally.health;
      const playerHpBefore = s.health;
      const r = withForcedHit(() => resolveEnemyAction(s, c, 2, 0));
      return {
        pass: ally.health < allyHpBefore && s.health === playerHpBefore,
        damage: r.damage, allyHpBefore, allyHpAfter: ally.health, playerHpBefore, playerHpAfter: s.health,
      };
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
