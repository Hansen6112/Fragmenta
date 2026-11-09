// Step 1e §4 gap fix: useApothecaryAbility never called applyEndlessStudy/
// applyWanderersReward/applyActionTypeTracking at all, unlike every other
// player action (playerAttack/useDecoy/useAmbush/useDisarm/
// useElementAbility). This isn't a pipeline-migration step (apothecary
// abilities have no target/hit-roll/damage shape -- see pipeline.js's own
// header), so there's no Legacy/new split and no checkParity oracle here --
// instead, this directly confirms the three calls now fire and feed the
// right trackers, the same convention every other ledger in this directory
// uses for a non-parity assertion.
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

    function makeApothecary() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'apothecary';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      s.knowledge = 30; // clears every apothecary ability's own knowledgeReq
      startCombat(s, 'stoneback_beetle', 25);
      s.combat.enemies[0].hp = 100000;
      s.combat.enemies[0].maxHp = 100000; // non-kill: keep combat alive for the tail to run
      return s;
    }

    function withStubs(effects, fn) {
      const origHasEffect = window.hasEffect;
      const effectSet = new Set(effects);
      window.hasEffect = (obj, id) => effectSet.has(id);
      try { return fn(); } finally { window.hasEffect = origHasEffect; }
    }

    record('P1E-APOTH-ENDLESSSTUDY-01', 'Endless Study now fires on a first apothecary cast (+2 Magic, key recorded)', () => {
      return withStubs(['endless_study'], () => {
        const s = makeApothecary();
        const lines = useApothecaryAbility(s, 'rousing_tonic');
        const fired = lines.join(' ').includes('Endless Study');
        const keyRecorded = (s.combat.endlessStudyKeys || []).includes('rousing_tonic');
        const bonusGranted = (s.combat.endlessStudyMagicBonus || 0) === 2;
        return { pass: fired && keyRecorded && bonusGranted, fired, keyRecorded, bonusGranted, lines };
      });
    });

    record('P1E-APOTH-ENDLESSSTUDY-NOOP-01', "Endless Study doesn't fire a second time for the SAME apothecary key (control: without the effect, it never fires at all)", () => {
      return withStubs(['endless_study'], () => {
        const s = makeApothecary();
        useApothecaryAbility(s, 'rousing_tonic'); // first use: grants +2
        s.combat.cooldowns.rousing_tonic = 0; // bypass cooldown for a same-turn second cast
        const lines2 = useApothecaryAbility(s, 'rousing_tonic');
        const noSecondGrant = lines2.join(' ').indexOf('Endless Study') === -1 && (s.combat.endlessStudyMagicBonus || 0) === 2;
        const withoutEffect = withStubs([], () => {
          const s2 = makeApothecary();
          useApothecaryAbility(s2, 'rousing_tonic');
          return (s2.combat.endlessStudyMagicBonus || 0) === 0;
        });
        return { pass: noSecondGrant && withoutEffect, noSecondGrant, withoutEffect };
      });
    });

    record('P1E-APOTH-WANDERERSREWARD-01', "Wanderer's Reward now fires on a first apothecary cast (+4 Attack/+4 Magic buff)", () => {
      return withStubs(['wanderers_reward'], () => {
        const s = makeApothecary();
        const lines = useApothecaryAbility(s, 'rousing_tonic');
        const fired = lines.join(' ').includes("Wanderer's Reward");
        const recentRecorded = (s.combat.recentActionKeys || []).includes('rousing_tonic');
        const buffGranted = (s.combat.atkBuffAmount || 0) > 0 && (s.combat.magicBuffAmount || 0) > 0;
        return { pass: fired && recentRecorded && buffGranted, fired, recentRecorded, buffGranted, lines };
      });
    });

    record('P1E-APOTH-ACTIONTYPETRACKING-01', 'applyActionTypeTracking now fires on an apothecary cast, recorded under its own "apothecary" category (not folded into attack/tactic/elemental)', () => {
      const s = makeApothecary();
      useApothecaryAbility(s, 'rousing_tonic');
      const lastType = s.combat.lastActionType;
      const historyTail = (s.combat.actionTypeHistory || []).slice(-1)[0];
      return { pass: lastType === 'apothecary' && historyTail === 'apothecary', lastType, historyTail };
    });

    record('P1E-APOTH-MOMENTUMUNBOUND-01', "Momentum Unbound's rhythm-shift check treats apothecary as genuinely distinct from a prior attack (control: no shift is detected within two apothecary casts in a row)", () => {
      return withStubs(['momentum_unbound'], () => {
        const s = makeApothecary();
        s.combat.lastActionType = 'attack'; // pretend a basic attack happened last
        const lines = useApothecaryAbility(s, 'rousing_tonic');
        const shiftDetected = lines.join(' ').includes('Momentum Unbound');
        const stacksGrew = (s.combat.momentumUnboundStacks || 0) === 1;
        s.combat.cooldowns.rousing_tonic = 0;
        const lines2 = useApothecaryAbility(s, 'rousing_tonic'); // same category twice in a row: no shift
        const noSecondShift = !lines2.join(' ').includes('Momentum Unbound') && (s.combat.momentumUnboundStacks || 0) === 1;
        return { pass: shiftDetected && stacksGrew && noSecondShift, shiftDetected, stacksGrew, noSecondShift };
      });
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`Step 1e §4 apothecary action-tracking fix: ${out.summary.passed}/${out.summary.total} passed`);
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
