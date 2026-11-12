// Layer 1 (forced-roll unit parity), Combat Rebuild Phase 1 step 1e-ii:
// Decoy/Ambush/Disarm, moved onto the five-step pipeline (Feint is NOT
// migrated -- it never rolls to hit or deals damage; see pipeline.js's
// own header on useDecoy/useAmbush/useDisarm for why). Each Legacy
// function (combat.js, byte-identical) is the kept oracle for its new
// pipeline-backed counterpart (pipeline.js); every scenario compares
// the two FULL orchestrator calls, same convention step 1e-i's own
// ledger uses, so the surrounding turn bookkeeping each tactic's own
// code keeps (cooldowns, excludeIndex handling, which post-effects run
// or don't) is re-verified for regression safety too.
//
// Step 1h-ii has now deleted useDecoyLegacy/useAmbushLegacy/useDisarmLegacy
// (and the other 12 doomed functions elsewhere) -- this file no longer
// calls any of them. Every scenario's oldRun comes from the frozen
// fixture at tools/tests/fixtures/phase1_step1e_ii_tactics_pipeline_parity.json,
// captured in step 1h-i (freeze_legacy_oracles.js) while the oracles
// still existed.
const { chromium } = require('playwright');
const { seedPageRandom } = require('./seed_rng');
const fs = require('fs');
const path = require('path');
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'phase1_step1e_ii_tactics_pipeline_parity.json');
const frozenIn = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const seed = await seedPageRandom(page);
  console.log(`seed: ${seed}`);
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

    function makeWarrior() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      s.knowledge = 30; // clears every tactic's own knowledgeReq (Disarm's 18 is the highest)
      startCombat(s, 'stoneback_beetle', 25);
      return s;
    }
    function makeMage() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      s.flags.isMage = true;
      s.primaryElement = 'fire';
      s.knowledge = 30;
      startCombat(s, 'stoneback_beetle', 25);
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
      if (combat) {
        combat = Object.assign({}, combat);
        if (combat.player) {
          Object.assign(combat, combat.player);
          delete combat.player;
        }
        if (Array.isArray(combat.enemies) && combat.enemies[combat.activeIndex]) {
          const slot = combat.enemies[combat.activeIndex];
          PER_ENEMY_FIELDS.forEach((f) => { combat[f] = slot[f]; });
        }
      }
      return sortedStringify({ combat: combat, health: s.health, party: s.party });
    }

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
        const s = scenario.useMage ? makeMage() : makeWarrior();
        const creature = s.combat.enemies[0].creatureObj;
        if (scenario.mutate) scenario.mutate(s, creature);
        const result = fn(s);
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

    // ============ Decoy ============
    checkParity('P1E-II-D-HIT-01', 'Decoy: plain hit, low-range rolls', useDecoy, { seq: LOW });
    checkParity('P1E-II-D-HIT-02', 'Decoy: mid-range rolls (randInt spread)', useDecoy, { seq: MID });
    checkParity('P1E-II-D-MISS-01', "Decoy: a miss (never provokes riposteCounterOnPlayer -- useDecoyLegacy's own miss branch never calls it, confirmed by reading; not re-tested via hasEffect('riposte') here since that stub also flips the PLAYER's own unrelated maybeRiposte check)", useDecoy, { seq: HIGH });
    checkParity('P1E-II-D-SPELL-01', "Decoy: a mage's own hit still takes the spell branch (activeElement always undefined for Decoy, unlike the basic attack)", useDecoy, { seq: LOW, useMage: true });
    checkParity('P1E-II-D-BANKEDDEF-01', "Decoy: the enemy's banked Brace/Guarded Strike Defense is read AND consumed exactly once", useDecoy, {
      seq: LOW, mutate: (s, creature) => { creature.braceBonusDef = 3; creature.guardedStrikeBonusDef = 2; },
    });
    checkParity('P1E-II-D-SUREFOUND-01', 'Decoy: Sure Foundation (physical branch) consumes and re-grants itself', useDecoy, {
      effects: ['dra_e05_sure_foundation'], mutate: (s, creature) => { creature.sureFoundationBonusDef = 2; }, seq: LOW,
    });
    checkParity('P1E-II-D-SUREFOUND-SPELL-01', "Decoy: Sure Foundation never applies to a spell hit", useDecoy, {
      effects: ['dra_e05_sure_foundation'], mutate: (s, creature) => { creature.sureFoundationBonusDef = 2; }, seq: LOW, useMage: true, expectEffectMatters: false,
    });
    checkParity('P1E-II-D-SIEGECORPS-01', "Decoy: Siege Corps' one-shot Attack charge is peeked and consumed exactly once, producing the identical roll", useDecoy, {
      seq: LOW, mutate: (s) => { s.combat.player.siegeCorpsAtkCharge = 2; },
    });
    checkParity('P1E-II-D-OPENINGREACH-01', "Decoy: Opening Reach's 1.15x applies unconditionally (no isPhysical gate, unlike the basic attack)", useDecoy, {
      effects: ['opening_reach'], seq: LOW,
    });
    checkParity('P1E-II-D-OPENINGREACH-SPELL-01', "Decoy: Opening Reach STILL applies on a mage's spell-branch hit (the asymmetry itself, pinned)", useDecoy, {
      effects: ['opening_reach'], seq: LOW, useMage: true,
    });
    checkParity('P1E-II-D-KILL-01', 'Decoy: a lethal hit kills via resolveKill and re-targets', useDecoy, {
      mutate: (s, creature) => { s.combat.enemies[0].hp = 1; s.combat.enemies[0].maxHp = 1; }, seq: LOW,
    });
    checkParity('P1E-II-D-PHYSONHIT-01', 'Decoy: a non-kill hit runs applyPhysicalOnHitEffects unconditionally', useDecoy, {
      effects: ['hamstring'], seq: LOW,
    });
    // Step 1e §4 gap fix (not a parity check -- useDecoyLegacy was EXPECTED
    // to differ here, since it never called lowHealthTriggerChecks at all;
    // this confirms the fix actually closed that gap rather than silently
    // no-op'ing). useDecoyLegacy no longer exists (step 1h-ii) -- oldFired
    // is hardcoded to its one possible value (false), confirmed by this
    // same scenario passing against the live oracle before it was deleted.
    record('P1E-II-D-LOWHEALTH-FIX-01', 'Decoy now runs lowHealthTriggerChecks (Rally the Line fires on the new useDecoy; useDecoyLegacy, before its step 1h-ii deletion, was confirmed to never fire it)', () => {
      const scenario = { seq: LOW, effects: ['rally_the_line'], mutate: (s) => { s.health = Math.max(1, Math.floor(s.maxHealth * 0.1)); s.combat.enemies[0].hp = 100000; s.combat.enemies[0].maxHp = 100000; } };
      const oldFired = false;
      const newRun = runOne(useDecoy, scenario);
      const newFired = /Rally the Line/.test(newRun.result.join(' '));
      return { pass: !oldFired && newFired, oldFired, newFired, newResult: newRun.result };
    });

    // ============ Ambush ============
    checkParity('P1E-II-A-HIT-01', 'Ambush: plain hit, low-range rolls', useAmbush, { seq: LOW });
    checkParity('P1E-II-A-HIT-02', 'Ambush: mid-range rolls', useAmbush, { seq: MID });
    checkParity('P1E-II-A-MISS-01', 'Ambush: a miss costs nothing, no counter, no damage', useAmbush, { seq: HIGH });
    checkParity('P1E-II-A-AMBUSHMULT-01', 'Ambush: ambush_mastery raises the Ambush multiplier from 1.4x to 1.55x', useAmbush, {
      effects: ['ambush_mastery'], seq: LOW,
    });
    checkParity('P1E-II-A-BANKEDDEF-01', "Ambush: the enemy's banked Defense is peeked and consumed exactly once", useAmbush, {
      seq: LOW, mutate: (s, creature) => { creature.braceBonusDef = 3; creature.guardedStrikeBonusDef = 2; },
    });
    checkParity('P1E-II-A-SIEGECORPS-01', "Ambush: Siege Corps' charge purity fix produces the identical roll", useAmbush, {
      seq: LOW, mutate: (s) => { s.combat.player.siegeCorpsAtkCharge = 2; },
    });
    checkParity('P1E-II-A-BORROWEDSECONDS-01', "Ambush: Borrowed Seconds' flat +15% (no cooldown to refund)", useAmbush, {
      effects: ['borrowed_seconds'], mutate: (s) => { s.combat.player.actionCounter = 3; }, seq: LOW,
    });
    checkParity('P1E-II-A-KILL-01', 'Ambush: a lethal hit kills via resolveKill and re-targets', useAmbush, {
      mutate: (s, creature) => { s.combat.enemies[0].hp = 1; s.combat.enemies[0].maxHp = 1; }, seq: LOW,
    });
    const survivable = (s, creature) => { s.combat.enemies[0].hp = 100000; s.combat.enemies[0].maxHp = 100000; };
    checkParity('P1E-II-A-PHYSONHIT-01', 'Ambush: a non-kill hit runs applyPhysicalOnHitEffects unconditionally', useAmbush, {
      effects: ['hamstring'], seq: LOW, mutate: survivable,
    });
    checkParity('P1E-II-A-EVASIVERELEASE-01', 'Ambush: Evasive Release grants an evasion charge on a non-kill hit', useAmbush, {
      effects: ['evasive_release'], seq: LOW, mutate: survivable,
    });
    // Step 1e §4 gap fix (not a parity check -- useAmbushLegacy was
    // EXPECTED to differ here, since it never called lowHealthTriggerChecks/
    // applyDodgeBlockNegateBonuses/maybeRiposte at all; these confirm the
    // fix actually closed that gap). useAmbushLegacy no longer exists
    // (step 1h-ii) -- oldFired is hardcoded to its one possible value
    // (false), confirmed by these same scenarios passing against the live
    // oracle before it was deleted.
    record('P1E-II-A-LOWHEALTH-FIX-01', 'Ambush now runs lowHealthTriggerChecks (Rally the Line fires on the new useAmbush; useAmbushLegacy, before its step 1h-ii deletion, was confirmed to never fire it)', () => {
      const scenario = { seq: LOW, effects: ['rally_the_line'], mutate: (s) => { s.health = Math.max(1, Math.floor(s.maxHealth * 0.1)); s.combat.enemies[0].hp = 100000; s.combat.enemies[0].maxHp = 100000; } };
      const oldFired = false;
      const newRun = runOne(useAmbush, scenario);
      const newFired = /Rally the Line/.test(newRun.result.join(' '));
      return { pass: !oldFired && newFired, oldFired, newFired, newResult: newRun.result };
    });
    record('P1E-II-A-DODGEBLOCK-FIX-01', "Ambush now runs applyDodgeBlockNegateBonuses when the round's retaliation deals 0 damage (Every Choice Matters fires on the new useAmbush; useAmbushLegacy, before its step 1h-ii deletion, was confirmed to never fire it)", () => {
      const scenario = { seq: LOW, effects: ['every_choice_matters'], mutate: survivable };
      const oldFired = false;
      const newRun = runOne(useAmbush, scenario);
      const newFired = /Every Choice Matters/.test(newRun.result.join(' '));
      return { pass: !oldFired && newFired, oldFired, newFired, newResult: newRun.result };
    });

    // ============ Disarm ============
    checkParity('P1E-II-DI-HIT-01', 'Disarm: plain hit, low-range rolls', useDisarm, { seq: LOW });
    checkParity('P1E-II-DI-HIT-02', 'Disarm: mid-range rolls', useDisarm, { seq: MID });
    checkParity('P1E-II-DI-MISS-01', 'Disarm: a missed follow-up still holds the disarm effect', useDisarm, { seq: HIGH });
    checkParity('P1E-II-DI-BANKEDDEF-01', "Disarm: the enemy's banked Defense is peeked and consumed exactly once", useDisarm, {
      seq: LOW, mutate: (s, creature) => { creature.braceBonusDef = 3; creature.guardedStrikeBonusDef = 2; },
    });
    checkParity('P1E-II-DI-SIEGECORPS-01', "Disarm: Siege Corps' charge purity fix produces the identical roll", useDisarm, {
      seq: LOW, mutate: (s) => { s.combat.player.siegeCorpsAtkCharge = 2; },
    });
    checkParity('P1E-II-DI-OPENINGREACH-01', "Disarm: Opening Reach applies unconditionally, same asymmetry as Decoy", useDisarm, {
      effects: ['opening_reach'], seq: LOW,
    });
    checkParity('P1E-II-DI-GUARDEDSTRIKE-01', 'Disarm: Guarded Strike grants its guardBonus unconditionally, regardless of whether the follow-up hit landed', useDisarm, {
      effects: ['guarded_strike'], seq: LOW,
    });
    checkParity('P1E-II-DI-KILL-01', 'Disarm: a lethal follow-up hit kills via resolveKill and re-targets', useDisarm, {
      mutate: (s, creature) => { s.combat.enemies[0].hp = 1; s.combat.enemies[0].maxHp = 1; }, seq: LOW,
    });
    checkParity('P1E-II-DI-PHYSONHIT-01', 'Disarm: a non-kill hit runs applyPhysicalOnHitEffects unconditionally', useDisarm, {
      effects: ['hamstring'], seq: LOW,
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  }, frozenIn);

  console.log(`Step 1e-ii tactics parity: ${out.summary.passed}/${out.summary.total} passed`);
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
