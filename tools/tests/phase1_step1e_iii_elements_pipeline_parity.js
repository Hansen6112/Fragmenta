// Layer 1 (forced-roll unit parity), Combat Rebuild Phase 1 step 1e-iii:
// element abilities, moved onto the five-step pipeline. Stoneskin
// (earth) is NOT migrated -- a pure self-buff with no target roll, same
// shape as Feint (step 1e-ii) -- but IS re-verified here for regression
// safety, comparing the full orchestrators directly like every other
// scenario in this file. useElementAbilityLegacy (combat.js, byte-
// identical) is the kept oracle for useElementAbility (pipeline.js).
//
// Step 1h-ii has now deleted useElementAbilityLegacy (and the other 14
// doomed functions elsewhere) -- this file no longer calls it. Every
// scenario's oldRun comes from the frozen fixture at
// tools/tests/fixtures/phase1_step1e_iii_elements_pipeline_parity.json,
// captured in step 1h-i (freeze_legacy_oracles.js) while the oracle
// still existed.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'phase1_step1e_iii_elements_pipeline_parity.json');
const frozenIn = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:8949/index.html');
  await page.waitForSelector('#input');

  const out = await page.evaluate((frozenIn) => {
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

    // A second enemy so a kill on enemies[0] doesn't end the fight and
    // null out state.combat before a snapshot can inspect it -- a
    // single-enemy fight masked exactly this step's own
    // hitsTakenFromPlayer regression (see P1E-III-LIGHTNING-KILL-01's
    // own comment).
    function addSecondEnemy(s) {
      const template = BESTIARY['stoneback_beetle'];
      const creature2 = buildFightCreature(template, 25, template.dangerClass, 'stoneback_beetle');
      const record2 = buildSummonedEnemyRecord('stoneback_beetle', creature2, 'test', false, null, true);
      s.combat.enemies.push(record2);
      return record2;
    }
    function makeMage(primaryElement, secondaryElement) {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      s.flags.isMage = true;
      s.primaryElement = primaryElement;
      if (secondaryElement) s.secondaryElement = secondaryElement;
      s.knowledge = 30;
      startCombat(s, 'stoneback_beetle', 25);
      addSecondEnemy(s);
      return s;
    }

    const LOW = Array(40).fill(0.02);
    const HIGH = Array(40).fill(0.98);
    const MID = Array(40).fill(0.5);

    function sortedStringify(obj) {
      return JSON.stringify(obj, (key, value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return Object.keys(value).sort().reduce((acc, k) => { acc[k] = value[k]; return acc; }, {});
        }
        return value;
      });
    }
    // Step 1h-iii flattened the 130 PLAYER_FIELDS entries out of
    // state.combat's own top level into state.combat.player -- this
    // fixture was frozen in step 1h-i, before that existed, so its own
    // snap strings still have those fields flat. Reconstructing that
    // same flat shape here (merging .player back up, dropping the key)
    // keeps this snapshot DATA-equivalent to the frozen one; sortedStringify
    // already makes key order a non-issue on both sides.
    function snapshot(s) {
      let combat = s.combat;
      if (combat && combat.player) {
        combat = Object.assign({}, combat, combat.player);
        delete combat.player;
      }
      return sortedStringify({ combat: combat, health: s.health, party: s.party });
    }

    // scenario: { element, secondaryElement, effects, sets, mutate(s, creature), seq, expectEffectMatters }
    function runOne(fn, scenario) {
      const origRandom = Math.random;
      const origHasEffect = window.hasEffect;
      const origHasSetTier = window.hasSetTier;
      const effects = new Set(scenario.effects || []);
      const sets = new Set(scenario.sets || []);
      window.hasEffect = (obj, id) => effects.has(id);
      window.hasSetTier = (obj, setName, tier) => sets.has(`${setName}:${tier}`);
      let i = 0;
      const seq = scenario.seq && scenario.seq.length ? scenario.seq : [0.5];
      Math.random = () => seq[i++ % seq.length];
      try {
        const s = makeMage(scenario.element, scenario.secondaryElement);
        const creature = s.combat.enemies[0].creatureObj;
        if (scenario.mutate) scenario.mutate(s, creature);
        const result = fn(s, scenario.element);
        return { result, snap: snapshot(s), s };
      } finally {
        Math.random = origRandom;
        window.hasEffect = origHasEffect;
        window.hasSetTier = origHasSetTier;
      }
    }

    function effectControlCheck(fn, scenario) {
      const hasToggle = (scenario.effects && scenario.effects.length) || (scenario.sets && scenario.sets.length);
      if (!hasToggle) return { applicable: false, mattered: null };
      if (scenario.expectEffectMatters === false) return { applicable: true, expectMatters: false, mattered: null, skippedCheck: true };
      const bare = Object.assign({}, scenario, { effects: [], sets: [] });
      const withoutEffect = runOne(fn, bare);
      const withEffect = runOne(fn, scenario);
      const mattered = JSON.stringify(withEffect.result) !== JSON.stringify(withoutEffect.result) || withEffect.snap !== withoutEffect.snap;
      return { applicable: true, expectMatters: true, mattered };
    }

    function checkParity(code, description, newFn, scenario) {
      record(code, description, () => {
        const oldRun = frozenIn[code];
        const newRun = runOne(newFn, scenario);
        const resultMatch = JSON.stringify(oldRun.result) === JSON.stringify(newRun.result);
        const snapMatch = oldRun.snap === newRun.snap;
        const control = effectControlCheck(newFn, scenario);
        const controlOk = !control.applicable || control.skippedCheck || control.mattered === control.expectMatters;
        return {
          pass: resultMatch && snapMatch && controlOk,
          resultMatch, snapMatch, controlOk,
          oldResult: oldRun.result, newResult: newRun.result,
          effectControl: control.applicable ? { expectMatters: control.expectMatters, mattered: control.mattered, skippedCheck: !!control.skippedCheck } : 'n/a',
        };
      });
    }

    const useElementAbilityWrap = (s, el) => useElementAbility(s, el);

    // ============ One hit scenario per element ============
    checkParity('P1E-III-FIRE-01', 'Fire (Ignite): a hit sets the burn DoT', useElementAbilityWrap, { element: 'fire', seq: LOW });
    checkParity('P1E-III-FIRE-MISS-01', 'Fire: a miss', useElementAbilityWrap, { element: 'fire', seq: HIGH });
    checkParity('P1E-III-WATER-01', 'Water (Torrent): a hit heals the player', useElementAbilityWrap, { element: 'water', seq: LOW });
    checkParity('P1E-III-WATER-SOVEREIGNTY-01', "Water: First Sword's Regalia 10pc refreshes sovereigntyTurnsLeft", useElementAbilityWrap, {
      element: 'water', seq: LOW, sets: ["First Sword's Regalia:10"],
    });
    checkParity('P1E-III-EARTH-01', 'Earth (Stoneskin): a pure self-buff, no target roll at all (not migrated, re-verified)', useElementAbilityWrap, { element: 'earth', seq: MID });
    checkParity('P1E-III-EARTH-FOCUS-01', 'Earth: Elemental Focus raises the Defense buff', useElementAbilityWrap, {
      element: 'earth', seq: MID, effects: ['elemental_focus'],
    });
    checkParity('P1E-III-LIGHTNING-01', 'Lightning (Flurry): both hits land on a tough target', useElementAbilityWrap, {
      element: 'lightning', seq: LOW, mutate: (s, creature) => { s.combat.enemies[0].hp = 100000; s.combat.enemies[0].maxHp = 100000; },
    });
    checkParity('P1E-III-LIGHTNING-KILL-01', "Lightning: the first hit alone kills -- the second hit never fires (state.combat.hp > 0 gate)", useElementAbilityWrap, {
      element: 'lightning', seq: LOW, mutate: (s, creature) => { s.combat.enemies[0].hp = 1; s.combat.enemies[0].maxHp = 1; },
    });
    checkParity('P1E-III-LIGHTNING-MISS-01', 'Lightning: a miss skips both hits entirely', useElementAbilityWrap, { element: 'lightning', seq: HIGH });
    checkParity('P1E-III-ACID-01', "Acid (Corrode): a hit sets corroded and the enemy Defense penalty", useElementAbilityWrap, { element: 'acid', seq: LOW });
    checkParity('P1E-III-ACID-ALREADYCORRODED-01', 'Acid: already corroded blocks the cast entirely', useElementAbilityWrap, {
      element: 'acid', seq: LOW, mutate: (s) => { s.combat.corroded = true; },
    });
    checkParity('P1E-III-FORCE-01', 'Force (Concuss): a hit stuns the enemy via tryApplyEnemyStun', useElementAbilityWrap, { element: 'force', seq: LOW });
    checkParity('P1E-III-TRANSPORT-01', 'Transportation (Blink): a hit applies its own 1.3x multiplier', useElementAbilityWrap, { element: 'transportation', seq: LOW });
    checkParity('P1E-III-AIR-01', 'Air (Windcut): a hit grants a 2-turn evasion window', useElementAbilityWrap, { element: 'air', seq: LOW });

    // ============ Shared purity fixes (checked once, via fire) ============
    checkParity('P1E-III-BANKEDDEF-01', "Fire: the enemy's banked Brace/Guarded Strike Defense is peeked and consumed exactly once", useElementAbilityWrap, {
      element: 'fire', seq: LOW, mutate: (s, creature) => { creature.braceBonusDef = 3; creature.guardedStrikeBonusDef = 2; },
    });
    checkParity('P1E-III-SIEGECORPS-01', "Fire: Siege Corps' charge purity fix produces the identical roll (an element cast is always the spell branch, so this never actually fires -- but must still produce identical output either way)", useElementAbilityWrap, {
      element: 'fire', seq: LOW, mutate: (s) => { s.combat.player.siegeCorpsAtkCharge = 2; },
    });

    // ============ Cross-cutting (synergy / Spell Echo / kill-after-synergy ordering) ============
    checkParity('P1E-III-SYNERGY-01', 'Fire cast right after Water triggers a synergy bonus', useElementAbilityWrap, {
      element: 'fire', secondaryElement: 'water', seq: LOW, mutate: (s) => { s.combat.player.lastElementUsed = 'water'; },
    });
    checkParity('P1E-III-SPELLECHO-01', 'Spell Echo repeats the cast at half power after a non-kill hit', useElementAbilityWrap, {
      element: 'fire', seq: LOW, effects: ['spell_echo'],
      mutate: (s, creature) => { s.combat.enemies[0].hp = 100000; s.combat.enemies[0].maxHp = 100000; },
    });
    checkParity('P1E-III-SPELLECHO-KILL-01', "Spell Echo never fires once the primary hit already killed (state.combat.hp > 0 gate) -- with or without the effect, the outcome is identical", useElementAbilityWrap, {
      element: 'fire', seq: LOW, effects: ['spell_echo'], expectEffectMatters: false,
      mutate: (s, creature) => { s.combat.enemies[0].hp = 1; s.combat.enemies[0].maxHp = 1; },
    });

    // Step 1f-iii §4 (found while scoping audit rule P1): Spell Echo's
    // own direct `state.combat.hp -= echoDmg` write was moved onto the
    // pipeline (resolveSpellEchoOnEnemy, action.deferKillCheck), since
    // nothing in 1f-iii's own reaction work had touched it. The riskiest
    // part of that move is useElementAbilityLegacy's own unconditional
    // "if (state.combat.hp <= 0) resolveKill" check running exactly
    // ONCE no matter which hit (primary or echo) is the actual kill --
    // this scenario is the ECHO-kills case (the primary hit survives on
    // its own; P1E-III-SPELLECHO-KILL-01 above is the other case, the
    // PRIMARY hit killing and gating the echo off entirely). If
    // resolveSpellEchoOnEnemy's deferKillCheck didn't work and resolveKill
    // fired a second time, oldRun/newRun's lines (loot, flavor text) would
    // diverge and this comparison would catch it.
    (function () {
      const origRandom = Math.random;
      Math.random = () => 0.02;
      let primaryDmg;
      try {
        const probe = makeMage('fire');
        const e = probe.combat.enemies[0];
        e.hp = 100000; e.maxHp = 100000;
        const hpBefore = e.hp;
        useElementAbility(probe, 'fire'); // spell_echo not equipped on this probe -- isolates the primary hit's own damage
        primaryDmg = hpBefore - e.hp;
      } finally {
        Math.random = origRandom;
      }
      checkParity('P1E-III-SPELLECHO-ECHOKILL-01', "Spell Echo itself is the killing blow -- the primary hit alone survives (hp = primaryDmg + 1), the echo (0.5x) finishes it, and resolveKill still fires exactly once", useElementAbilityWrap, {
        element: 'fire', seq: LOW, effects: ['spell_echo'],
        mutate: (s, creature) => { s.combat.enemies[0].hp = primaryDmg + 1; s.combat.enemies[0].maxHp = primaryDmg + 1; },
      });
    })();

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  }, frozenIn);

  console.log(`Step 1e-iii element ability parity: ${out.summary.passed}/${out.summary.total} passed`);
  if (out.summary.failed.length) {
    console.log('FAILURES:');
    for (const f of out.summary.failed) {
      console.log(`  ${f.code}: ${f.description}`);
      console.log(`    detail: ${JSON.stringify(f.detail)}`);
    }
  }
  console.log(`RESULT: ${out.summary.passed}/${out.summary.total}`);

  await browser.close();
  process.exit(out.summary.failed.length ? 1 : 0);
})();
