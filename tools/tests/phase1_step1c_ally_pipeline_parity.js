// Layer 1 (forced-roll unit parity), step 1c: resolveEnemyAttackOnAllyLegacy
// (the kept, unchanged oracle) vs resolveEnemyAttackOnAlly (the new
// pipeline) must produce IDENTICAL {lines, damage} and resulting state,
// under forced Math.random and stubbed hasEffect/hasSetTier, across every
// named branch -- same methodology as step 1b's own suite, including the
// "effect changed something" control on every scenario naming a gear
// toggle (added after the Spell Ward false-pass in step 1b's own review).
//
// Step 1h-i: resolveEnemyAttackOnAllyLegacy is one of the 15 functions
// step 1h deletes. FREEZE_LEGACY_ORACLES=1 runs this file in "freeze"
// mode instead of its normal verify mode -- it still calls the live
// oracle (so this only works BEFORE 1h-ii deletes it) but writes each
// scenario's oldRun to tools/tests/fixtures/phase1_step1c_ally_pipeline_parity.json
// instead of comparing it. After that fixture exists, normal runs read
// oldRun from it instead of calling resolveEnemyAttackOnAllyLegacy.
const { chromium } = require('playwright');
const { seedPageRandom } = require('./seed_rng');
const fs = require('fs');
const path = require('path');
const FREEZE = process.env.FREEZE_LEGACY_ORACLES === '1';
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'phase1_step1c_ally_pipeline_parity.json');
const frozenIn = FREEZE ? {} : JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const seed = await seedPageRandom(page);
  console.log(`seed: ${seed}`);
  await page.goto('http://localhost:8949/index.html');
  await page.waitForSelector('#input');

  const out = await page.evaluate(({ FREEZE, frozenIn }) => {
    const ledger = [];
    const frozenOut = {};
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
      return s;
    }

    // Step 1h-iii flattened the 130 PLAYER_FIELDS entries out of
    // state.combat's own top level into state.combat.player -- this
    // fixture was frozen in step 1h-i, before that existed, so its own
    // snap strings still have those fields flat. Reconstructing that
    // same flat shape here (merging .player back up, dropping the key)
    // keeps this snapshot DATA-equivalent to the frozen one; stableStringify
    // (used wherever a snap is actually compared, not here) is what makes
    // the two comparable despite the now-different property insertion
    // order neither side can undo.
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
      return JSON.stringify({
        health: s.health, maxHealth: s.maxHealth, playerDowned: s.playerDowned,
        injuries: s.injuries, combat: combat, party: s.party,
      });
    }
    function stableStringify(x) {
      if (x === null || typeof x !== 'object') return JSON.stringify(x);
      if (Array.isArray(x)) return '[' + x.map(stableStringify).join(',') + ']';
      const keys = Object.keys(x).sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(x[k])).join(',') + '}';
    }
    function normalizeSnap(snapStr) {
      return stableStringify(JSON.parse(snapStr));
    }

    // scenario: { effects: [ids], sets: ["Name:tier"], mutate(s, creature, slot, ally),
    //   args: (creature, ally) => [abilityCtx, basicFirstBonus], seq: [randoms] }
    function runOne(fn, scenario) {
      const origRandom = Math.random;
      const origHasEffect = window.hasEffect;
      const origHasSetTier = window.hasSetTier;
      const effects = new Set(scenario.effects || []);
      const sets = new Set(scenario.sets || []);
      window.hasEffect = (obj, id) => effects.has(id);
      window.hasSetTier = (obj, setName, tier) => sets.has(`${setName}:${tier}`);
      let i = 0, randomCount = 0;
      const seq = scenario.seq && scenario.seq.length ? scenario.seq : [0.5];
      Math.random = () => { randomCount++; return seq[i++ % seq.length]; };
      // This fixture was frozen (step 1h-i) against the Legacy functions,
      // which predate every COMBAT_UNIFY switch. The parity claim this
      // file checks ("the pipeline migration didn't change behavior") was
      // only ever true with every switch off; once a switch's own
      // committed DEFAULT flips true (the Phase 1 close-out handoff's
      // whole point — e.g. U3e writing freshly-zeroed banked-Defense
      // fields onto this same creature object even on an ally-reaction
      // path that doesn't use them), this test would otherwise silently
      // start comparing new, intentionally-changed state against the old
      // oracle and fail for the right reason but the wrong test. Pin
      // every switch false here so this file keeps checking the one thing
      // it was built to check.
      const origUnify = Object.assign({}, COMBAT_UNIFY);
      for (const k of Object.keys(COMBAT_UNIFY)) COMBAT_UNIFY[k] = false;
      try {
        const s = makeWarrior();
        startCombat(s, 'stoneback_beetle', 25);
        const slot = s.combat.enemies[0];
        const creature = slot.creatureObj;
        const ally = s.recruitAlly('kessa');
        if (scenario.mutate) scenario.mutate(s, creature, slot, ally);
        const args = scenario.args ? scenario.args(creature, ally) : [null, null];
        const result = fn(s, creature, ally, ...args);
        return { result, randomCount, snap: snapshot(s) };
      } finally {
        Math.random = origRandom;
        window.hasEffect = origHasEffect;
        window.hasSetTier = origHasSetTier;
        Object.assign(COMBAT_UNIFY, origUnify);
      }
    }

    function effectControlCheck(scenario) {
      const hasToggle = (scenario.effects && scenario.effects.length) || (scenario.sets && scenario.sets.length);
      if (!hasToggle) return { applicable: false, mattered: null };
      if (scenario.expectEffectMatters === false) return { applicable: true, expectMatters: false, mattered: null, skippedCheck: true };
      const bare = Object.assign({}, scenario, { effects: [], sets: [] });
      const withoutEffect = runOne(resolveEnemyAttackOnAlly, bare);
      const withEffect = runOne(resolveEnemyAttackOnAlly, scenario);
      const mattered = JSON.stringify(withEffect.result) !== JSON.stringify(withoutEffect.result) || withEffect.snap !== withoutEffect.snap;
      return { applicable: true, expectMatters: true, mattered, withoutEffect: withoutEffect.result, withEffect: withEffect.result };
    }

    function checkParity(code, description, scenario) {
      record(code, description, () => {
        const oldRun = FREEZE ? runOne(resolveEnemyAttackOnAllyLegacy, scenario) : frozenIn[code];
        if (FREEZE) frozenOut[code] = { result: oldRun.result, randomCount: oldRun.randomCount, snap: oldRun.snap };
        const newRun = runOne(resolveEnemyAttackOnAlly, scenario);
        const resultMatch = JSON.stringify(oldRun.result) === JSON.stringify(newRun.result);
        const snapMatch = normalizeSnap(oldRun.snap) === normalizeSnap(newRun.snap);
        const countMatch = oldRun.randomCount === newRun.randomCount;
        const control = effectControlCheck(scenario);
        const controlOk = !control.applicable || control.skippedCheck || control.mattered === control.expectMatters;
        return {
          pass: resultMatch && snapMatch && countMatch && controlOk,
          resultMatch, snapMatch, countMatch, controlOk,
          oldResult: oldRun.result, newResult: newRun.result,
          oldCount: oldRun.randomCount, newCount: newRun.randomCount,
          snapDiffHint: snapMatch ? null : { old: oldRun.snap.length, new: newRun.snap.length },
          effectControl: control.applicable ? { expectMatters: control.expectMatters, mattered: control.mattered, skippedCheck: !!control.skippedCheck } : 'n/a (no effects/sets toggle on this scenario)',
        };
      });
    }

    const LOW = Array(40).fill(0.02);
    const HIGH = Array(40).fill(0.98);
    const MID = Array(40).fill(0.5);

    checkParity('P1C-MISS-01', 'A miss (forced high random) provokes Riposte-by-ally-on-enemy -- the ally-path-only reaction a player-targeted miss never has', {
      seq: HIGH,
    });
    // Step 1f-iii §4: P1C-MISS-01 above never actually equips Riposte, so
    // it only proves the no-op path. riposteCounterByAllyOnEnemy now
    // runs through resolveRiposteCounterByAllyOnEnemy (pipeline.js) --
    // these two scenarios force the REAL counter-strike, with Riposte
    // actually equipped on the ally.
    checkParity('P1F3-RIPOSTE-ALLY-ONENEMY-01', 'Riposte equipped on the ally: a miss provokes the real 0.5x counter-strike against the attacker, non-lethal', {
      effects: ['riposte'],
      seq: HIGH,
    });
    checkParity('P1F3-RIPOSTE-ALLY-ONENEMY-KILL-01', 'Riposte equipped on the ally: a miss provokes a counter-strike that kills the attacker (resolveKill via killEnemyAsAlly\'s own activeIndex redirect)', {
      effects: ['riposte'],
      mutate: (s, creature, slot) => { slot.hp = 1; slot.maxHp = 1; },
      seq: HIGH,
    });
    checkParity('P1C-HIT-01', 'A plain connecting physical hit on an ally, no gear effects active', {
      seq: LOW,
    });
    checkParity('P1C-HIT-02', 'A plain connecting hit with mid-range random rolls (exercises the randInt spread)', {
      seq: MID,
    });
    // This orchestrator (and its legacy oracle) never checked stun at all
    // -- that's unchanged by D1 (9 Nov): the check now lives one layer up,
    // in resolveEnemyAction (combat.js), BEFORE this function is ever
    // called, for both player- and ally-targeted attacks alike. So this
    // scenario still correctly parity-matches the oracle (neither checks
    // it), it's just no longer evidence of an asymmetry -- a stunned
    // enemy that reaches this far (e.g. called directly, bypassing
    // resolveEnemyAction, as this test harness does) simply was never
    // going to be stopped at THIS layer, by either version, on purpose.
    // See tools/tests/d1_stun_fix_ledger.js for the real stun coverage.
    checkParity('P1C-NOSTUN-01', 'Neither this function nor its oracle gate on stun -- that check now lives above both, in resolveEnemyAction', {
      mutate: (s, creature, slot) => { slot.enemyStunCharges = 2; },
      seq: LOW,
    });
    checkParity('P1C-NOREINFORCED-01', 'Asymmetry preserved: Reinforced (equipped) never increments its counter on an ally-targeted attack', {
      effects: ['reinforced'],
      mutate: (s) => { activeEnemySlot(s.combat).reinforcedAttackCount = 2; },
      seq: LOW,
      expectEffectMatters: false, // the whole point: equipping Reinforced changes nothing here, by design
    });
    checkParity('P1C-NOEVASION-01', 'Asymmetry preserved: Guardian Spirit/Timeless Guard/evasion charges -- all player-only -- never intercept an ally-targeted attack', {
      effects: ['guardian_spirit', 'timeless_guard', 'guided_footsteps', 'never_where_expected'],
      mutate: (s) => { s.combat.player.avatarOfFreedomTurns = 3; s.combat.player.evasionCharges = 1; },
      seq: LOW,
      expectEffectMatters: false, // none of these are even checked in the ally branch
    });

    checkParity('P1C-ACCBONUS-01', 'Duelist’s Measure (keyed to this ally’s own name) + Calculated Aim + banked prep acc + Measured Aim all stack into the accuracy roll, all consumed on the attempt', {
      effects: ['sang_cu_ie007_duelists_measure', 'sang_iag_ie003_measured_aim'],
      mutate: (s, creature, slot, ally) => {
        creature.duelistMeasurePendingTarget = ally.name;
        creature.bankedAttackAccBonusTurnsLeft = 2;
        creature.bankedAttackAccBonus = 5;
        creature.bankedAttackDmgMultBonus = 1.2;
      },
      seq: LOW,
    });
    checkParity('P1C-ACCBONUS-FALSE-01', 'Duelist’s Measure pending for a DIFFERENT name withholds the bonus -- the meaningful false branch, not just absence', {
      effects: ['sang_cu_ie007_duelists_measure'],
      mutate: (s, creature) => { creature.duelistMeasurePendingTarget = 'someone_else'; },
      seq: LOW,
      expectEffectMatters: false,
    });
    checkParity('P1C-CALCAIM-01', 'Calculated Aim (or Concealed Edge): +8 accuracy on the first damaging attempt, flag consumed', {
      effects: ['sang_mil_ie003_calculated_aim'],
      seq: LOW,
    });

    checkParity('P1C-OPENINGREACH-01', 'Opening Reach: a basic physical attack’s first hit this fight deals 1.15x against an ally too', {
      effects: ['opening_reach'],
      seq: LOW,
    });
    checkParity('P1C-ICEFORGED-01', 'Ice-Forged Edge: every hit, no stacking, against an ally', {
      effects: ['dra_e01_ice_forged_edge'],
      seq: LOW,
    });
    checkParity('P1C-UNBROKENGRIP-01', 'Unbroken Grip: first physical weapon attack each combat -- shares the SAME flag the player-path copy sets', {
      effects: ['dra_e04_unbroken_grip'],
      seq: LOW,
    });
    checkParity('P1C-EXECSEAL-01', 'Executioner’s Seal: checked against the ALLY’s own HP%, not the player’s', {
      effects: ['dra_e06_executioners_seal'],
      mutate: (s, creature, slot, ally) => { ally.health = Math.round(ally.maxHealth * 0.2); },
      seq: LOW,
    });
    checkParity('P1C-BLACKICE-01', 'Black-Ice Reserve: peeked only, against an ally hit', {
      effects: ['dra_e09_black_ice_reserve'],
      mutate: (s, creature) => { creature.blackIceReservePending = true; },
      seq: LOW,
    });
    checkParity('P1C-TYRANTSEDGE-01', 'Tyrant’s Edge: HP threshold + cooldown + max-twice-per-combat cap, against an ally’s own HP%', {
      effects: ['sang_cu_ie012_tyrants_edge'],
      mutate: (s, creature, slot, ally) => { ally.health = Math.round(ally.maxHealth * 0.2); },
      seq: LOW,
    });
    checkParity('P1C-DECISIVEIMPACT-01', 'Decisive Impact: first successful damaging attack each combat, against an ally', {
      effects: ['sang_mil_ie005_decisive_impact'],
      seq: LOW,
    });
    checkParity('P1C-SILENTPREP-01', 'Silent Preparation: banked dmg mult peeked in the hit roll, applied in the damage calc, against an ally', {
      mutate: (s, creature) => { creature.bankedAttackAccBonusTurnsLeft = 2; creature.bankedAttackDmgMultBonus = 1.3; },
      seq: LOW,
    });

    checkParity('P1C-GUARDEDSTRIKE-01', 'Guarded Strike: banks +2 Defense for the wearer against whatever hits it next, basic-attack-only, against an ally', {
      effects: ['guarded_strike'],
      seq: LOW,
    });
    checkParity('P1C-SERRATED-01', 'Serrated Opening: first successful hit each combat applies Bleeding to the ally, only if not already Bleeding', {
      effects: ['sang_cu_ie003_serrated_opening'],
      seq: LOW,
    });
    checkParity('P1C-SERRATED-FALSE-01', 'Serrated Opening’s inflict is skipped (but its flag still consumes) when the ally is already Bleeding', {
      effects: ['sang_cu_ie003_serrated_opening'],
      mutate: (s, creature, slot, ally) => { ally.statuses = { bleed: { name: 'Bleeding', dot: { pctMaxHp: 0.02 }, turnsLeft: 2 } }; },
      seq: LOW,
    });
    checkParity('P1C-DUELISTGRANT-01', 'Duelist’s Measure banking: a successful hit banks +10 ACC for this creature’s next attempt against this SAME ally by name, max twice per combat', {
      effects: ['sang_cu_ie007_duelists_measure'],
      seq: LOW,
    });
    checkParity('P1C-INFLICT-CHILLED-01', 'Black-Ice Reserve is granted when an abilityCtx.inflict of "chilled" actually takes against the ally', {
      effects: ['dra_e09_black_ice_reserve'],
      args: () => [{ name: 'Frostbite Brand', dmgMult: 0.8, inflict: { status: 'chilled', chance: 1 } }, null],
      seq: LOW,
    });
    checkParity('P1C-HEALONHIT-01', 'abilityCtx.healOnHitPct heals the ATTACKING creature’s own slot (actor.store), not via the old activeEnemySlot(combat).hp proxy', {
      mutate: (s, creature, slot) => { slot.hp = 50; slot.maxHp = 100; },
      args: () => [{ name: 'Leeching Strike', dmgMult: 0.8, healOnHitPct: 0.5 }, null],
      seq: LOW,
    });
    checkParity('P1C-ABILITY-01', 'Ability-cast (abilityCtx) basic-vs-active distinction: dmgMult-driven damage, no Opening Reach, "uses X on" verb line, against an ally', {
      args: () => [{ name: 'Shield Bash', dmgMult: 0.8 }, null],
      seq: LOW,
    });
    checkParity('P1C-LETHAL-01', 'A lethal hit on the ally’s own health triggers killAlly from inside applyAndReact, with the state.combat null-guard honored', {
      mutate: (s, creature, slot, ally) => { ally.health = 1; },
      seq: LOW,
    });
    checkParity('P1C-NOATK-01', 'creature.atk === 0 (intentionally harmless): basic attack on an ally deals 0 regardless of mitigate', {
      mutate: (s, creature) => { creature.atk = 0; },
      seq: LOW,
    });
    checkParity('P1C-ARENAFLOOR-01', 'A non-lethal arena bout floors ally damage at 1 Health, same as the player’s own non-lethal floor', {
      mutate: (s, creature, slot, ally) => {
        s.combat.isArenaFight = true; s.combat.arenaLethal = false;
        ally.health = 50; ally.maxHealth = 1000; // tiny fraction of max, but the floor should still catch a would-be-lethal hit
        creature.atk = 99999;
      },
      seq: LOW,
    });

    return { ledger, frozenOut };
  }, { FREEZE, frozenIn });

  if (FREEZE) {
    fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(out.frozenOut, null, 2) + '\n');
    console.log(`Froze ${Object.keys(out.frozenOut).length} scenario(s) to ${FIXTURE_PATH}`);
    await browser.close();
    process.exit(0);
  }

  const ledger = out.ledger;
  console.log(JSON.stringify(ledger, null, 2));
  const fails = ledger.filter((e) => !e.pass);
  console.error(`\n${ledger.length - fails.length}/${ledger.length} passed`);
  if (fails.length) {
    console.error('FAILURES:');
    for (const f of fails) console.error(`  ${f.code}: ${f.description}\n    detail: ${JSON.stringify(f.detail).slice(0, 2000)}`);
  }
  console.log(`RESULT: ${ledger.length - fails.length}/${ledger.length}`);
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
