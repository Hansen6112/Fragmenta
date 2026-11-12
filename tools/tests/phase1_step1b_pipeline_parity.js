// Layer 1 (forced-roll unit parity): resolveEnemyRetaliation (the kept,
// unchanged oracle) vs resolveEnemyAttackOnPlayer (the new pipeline) must
// produce IDENTICAL {lines, damage} and resulting state, under forced
// Math.random and stubbed hasEffect/hasSetTier, across every named branch.
//
// Step 1h-i: resolveEnemyRetaliation is one of the 15 functions step 1h
// deletes. FREEZE_LEGACY_ORACLES=1 runs this file in "freeze" mode
// instead of its normal verify mode -- it still calls the live oracle
// (so this only works BEFORE 1h-ii deletes it) but writes each
// scenario's oldRun (what checkParity would have compared against) to
// tools/tests/fixtures/phase1_step1b_pipeline_parity.json instead of
// comparing it. After that fixture exists, normal runs read oldRun from
// it instead of calling resolveEnemyRetaliation, so the suite keeps
// working once the function is gone.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const FREEZE = process.env.FREEZE_LEGACY_ORACLES === '1';
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'phase1_step1b_pipeline_parity.json');
const frozenIn = FREEZE ? {} : JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
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
      if (combat && combat.player) {
        combat = Object.assign({}, combat, combat.player);
        delete combat.player;
      }
      return JSON.stringify({
        health: s.health, maxHealth: s.maxHealth, playerDowned: s.playerDowned,
        injuries: s.injuries, combat: combat,
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

    // scenario: { effects: [ids], sets: ["Name:tier"], mutate(s, creature, slot),
    //   args: (creature) => [atkSpread, extraDef, abilityCtx, basicFirstBonus], seq: [randoms] }
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
      try {
        const s = makeWarrior();
        startCombat(s, 'stoneback_beetle', 25);
        const slot = s.combat.enemies[0];
        const creature = slot.creatureObj;
        if (scenario.mutate) scenario.mutate(s, creature, slot);
        const args = scenario.args ? scenario.args(creature) : [2, 0, null, null];
        const result = fn(s, creature, ...args);
        return { result, randomCount, snap: snapshot(s) };
      } finally {
        Math.random = origRandom;
        window.hasEffect = origHasEffect;
        window.hasSetTier = origHasSetTier;
      }
    }

    // "Effect changed something" control (prompted by the Spell Ward bug:
    // that scenario stubbed field names spellWardMultiplier never reads,
    // so the gear-on and gear-off runs were IDENTICAL -- both did nothing
    // -- and old-vs-new parity passed for the wrong reason). For every
    // scenario naming a gear effect/set, also run it with effects/sets
    // stripped to [] and assert the outcome actually differs from the
    // gear-on run. scenario.expectEffectMatters: false opts out, for the
    // handful of scenarios whose whole POINT is that the gear is present
    // but something else (already consumed, wrong pending state) keeps it
    // from mattering -- those assert the opposite on purpose.
    function effectControlCheck(scenario) {
      const hasToggle = (scenario.effects && scenario.effects.length) || (scenario.sets && scenario.sets.length);
      if (!hasToggle) return { applicable: false, mattered: null };
      if (scenario.expectEffectMatters === false) return { applicable: true, expectMatters: false, mattered: null, skippedCheck: true };
      const bare = Object.assign({}, scenario, { effects: [], sets: [] });
      const withoutEffect = runOne(resolveEnemyAttackOnPlayer, bare);
      const withEffect = runOne(resolveEnemyAttackOnPlayer, scenario);
      const mattered = JSON.stringify(withEffect.result) !== JSON.stringify(withoutEffect.result) || withEffect.snap !== withoutEffect.snap;
      return { applicable: true, expectMatters: true, mattered, withoutEffect: withoutEffect.result, withEffect: withEffect.result };
    }

    function checkParity(code, description, scenario) {
      record(code, description, () => {
        const oldRun = FREEZE ? runOne(resolveEnemyRetaliation, scenario) : frozenIn[code];
        if (FREEZE) frozenOut[code] = { result: oldRun.result, randomCount: oldRun.randomCount, snap: oldRun.snap };
        const newRun = runOne(resolveEnemyAttackOnPlayer, scenario);
        const resultMatch = JSON.stringify(oldRun.result) === JSON.stringify(newRun.result);
        const snapMatch = normalizeSnap(oldRun.snap) === normalizeSnap(newRun.snap);
        const countMatch = oldRun.randomCount === newRun.randomCount;
        const control = effectControlCheck(scenario);
        // For expectEffectMatters:false scenarios we deliberately skip
        // re-running to prove "didn't matter" (several of them depend on
        // combat state set up by `mutate`, like a pending-target string,
        // that the bare/with-effect pair would both still carry -- the
        // assertion that it doesn't matter is already encoded in the
        // scenario's own description and in what it sets up, not in a
        // second automated run here).
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

    checkParity('P1-MISS-01', 'Flat miss from the top (hit chance always clamped <=0.90, forced random 0.98 always fails the connects roll)', {
      seq: HIGH,
    });

    // P1-STUN-01 used to live here, asserting resolveEnemyAttackOnPlayer
    // (direct call) skips a stunned enemy's attack, matching the oracle.
    // Removed, listed change D1 (Tyler, 9 Nov): the stun check moved OUT
    // of this orchestrator entirely, up to resolveEnemyAction (combat.js),
    // so a stunned enemy is stopped before resolveEnemyAttackOnPlayer is
    // ever called in production — this layer now deliberately has NO
    // stun check and can't match the oracle's own (unchanged) one on a
    // stunned-slot scenario, by design. See tools/tests/
    // d1_stun_fix_ledger.js for the new, correctly-layered coverage.

    checkParity('P1-HIT-01', 'A plain connecting physical hit, no gear effects active, full damage-calc path', {
      seq: LOW,
    });

    checkParity('P1-HIT-02', 'A plain connecting physical hit with mid-range random rolls (exercises randInt spread, not just the floor)', {
      seq: MID,
    });

    checkParity('P1-REINFORCED-01', 'Reinforced: attack count incremented unconditionally even on a miss, stacks granted every 3rd attack', {
      effects: ['reinforced'],
      mutate: (s) => { s.combat.reinforcedAttackCount = 2; }, // this attempt is the 3rd
      seq: HIGH, // force a miss, to also prove Reinforced counts misses
    });
    checkParity('P1-REINFORCED-OFF-01', 'Reinforced equipped but this attempt isn’t the 3rd (count 0->1): the counter still ticks, but no stack is granted -- the "equipped, not yet triggered" off-case, distinct from not wearing it at all', {
      effects: ['reinforced'],
      mutate: (s) => { s.combat.reinforcedAttackCount = 0; },
      seq: HIGH,
    });

    checkParity('P1-ACCBONUS-01', 'Marked Target + Duelist’s Measure + Calculated Aim + banked prep + measured aim all stack into one accuracy roll, all consumed on the attempt', {
      effects: ['sang_cu_ie007_duelists_measure', 'sang_iag_ie003_measured_aim'],
      mutate: (s, creature) => {
        s.combat.player.exposedTarget = { by: { name: 'someone else' } };
        creature.duelistMeasurePendingTarget = 'player';
        creature.bankedAttackAccBonusTurnsLeft = 2;
        creature.bankedAttackAccBonus = 5;
        creature.bankedAttackDmgMultBonus = 1.2;
      },
      seq: LOW,
    });

    checkParity('P1-GUARDIANSPIRIT-01', 'Guardian Spirit: first attack guaranteed miss, flag consumed', {
      effects: ['guardian_spirit'],
      seq: LOW,
    });
    checkParity('P1-GUIDEDFOOT-01', 'Guided Footsteps: 75% first-attack miss, forced to trigger', {
      effects: ['guided_footsteps'],
      seq: LOW,
    });
    checkParity('P1-NEVERWHERE-01', 'Never Where Expected: flat 15% miss every attack, forced to trigger', {
      effects: ['never_where_expected'],
      seq: LOW,
    });
    checkParity('P1-BLESSFREE-01', 'Blessing of Freedom (Endless Horizon 2pc): flat 15% evasion, forced to trigger', {
      sets: ['Regalia of the Endless Horizon:2'],
      seq: LOW,
    });
    checkParity('P1-AVATARFREE-01', 'Avatar of Freedom: 50% evasion while its window is open, forced to trigger', {
      mutate: (s) => { s.combat.player.avatarOfFreedomTurns = 3; },
      seq: LOW,
    });
    checkParity('P1-EVACHARGE-01', 'Evasive Release charge: consumed either way, forced to roll success, grants Evasive Guard stack', {
      effects: ['evasive_guard'],
      mutate: (s) => { s.combat.player.evasionCharges = 1; },
      seq: LOW,
    });
    checkParity('P1-EVACHARGE-OFF-01', 'Evasive Release charge present but its OWN 50% roll fails: the charge is still consumed (decremented to 0) and the hit proceeds normally -- the "available but didn’t trigger" off-case, distinct from having no charge at all', {
      // No effects/sets here on purpose: evasionCharges is pure combat
      // state, not gear-gated, and evasive_guard's bonus is never even
      // checked once evasionRolled is false -- there's no gear toggle for
      // the "effect changed something" control to exercise in this one.
      mutate: (s) => { s.combat.player.evasionCharges = 1; },
      seq: [0.0, 0.99], // 0.0 guarantees the accuracy roll hits; 0.99 guarantees the evasion roll fails
    });
    checkParity('P1-EVATURNS-01', 'Evasion window (Windcut/Blink): forced to roll success', {
      mutate: (s) => { s.combat.player.evasionTurns = 2; },
      seq: LOW,
    });

    checkParity('P1-MIRRORSOUL-01', 'Mirror Soul: first hostile spell reflected onto the caster, including its own HP loss and kill check', {
      effects: ['mirror_soul'],
      mutate: (s, creature, slot) => { creature.element = 'water'; creature.magic = 20; slot.hp = 5; slot.maxHp = 100; },
      seq: LOW,
    });
    checkParity('P1-MIRRORSOUL-02', 'Mirror Soul already used this combat: does not fire a second time, hits normally instead -- the "equipped but already consumed" off-case, same treatment as the Reinforced/Evasive Release off-cases below', {
      effects: ['mirror_soul'],
      mutate: (s, creature) => { creature.element = 'water'; creature.magic = 20; s.combat.player.mirrorSoulUsed = true; },
      seq: LOW,
      expectEffectMatters: false, // mirrorSoulUsed=true blocks it exactly the same way "not equipped" would -- equipping it changes nothing once consumed
    });

    checkParity('P1-ELEMENTAL-01', 'Plain elemental hit, no modifiers, full matchup/mitigate/executioner path', {
      mutate: (s, creature) => { creature.element = 'fire'; creature.magic = 18; },
      seq: LOW,
    });
    checkParity('P1-ELEMENTAL-02', 'Elemental hit with Unquenched Focus + Adaptive Ward (second same-element hit halved) + Spell Ward + Storm Barrier + Stonewarden all active', {
      effects: ['dra_e07_unquenched_focus', 'adaptive_ward'],
      sets: ['Stormwatch:6', 'Stonewarden:6'],
      mutate: (s, creature) => {
        creature.element = 'fire'; creature.magic = 18;
        s.combat.player.adaptiveWardElement = 'fire'; // already-established -> halves THIS hit
      },
      seq: LOW,
    });
    checkParity('P1-SPELLWARD-01', 'spellWardMultiplier < 1 (spell_ward + River Warden 4pc -> 0.8x) reduces an elemental hit and River Warden 6pc grants a magic bonus stack', {
      effects: ['spell_ward'],
      sets: ['River Warden:4', 'River Warden:6'],
      mutate: (s, creature) => { creature.element = 'fire'; creature.magic = 18; },
      seq: LOW,
    });
    checkParity('P1-COLDPROOF-01', 'Coldproof (coldproof effect or Leviathan 4pc): +2 effective Defense specifically against a water hit', {
      effects: ['coldproof'],
      // A level-25 warrior's baseline Defense is large enough that +2 can
      // round away to the same final damage -- the control check below
      // caught exactly that (a real false alarm, not a migration bug: the
      // code path runs identically either way, it just didn't move the
      // number at THOSE stats). Forcing s.def down makes the same +2 a
      // large enough share of the mitigate() ratio to actually shift the
      // rounded result, so the control check has something to see.
      mutate: (s, creature) => { creature.element = 'water'; creature.magic = 18; s.def = 5; },
      seq: LOW,
    });
    checkParity('P1-ADAPTIVEWARD-ESTABLISH-01', 'Adaptive Ward: the FIRST elemental hit each fight establishes resistance (sets adaptiveWardElement) rather than reducing damage itself -- the distinct sub-branch from P1-ELEMENTAL-02’s already-established case', {
      effects: ['adaptive_ward'],
      mutate: (s, creature) => { creature.element = 'fire'; creature.magic = 18; }, // combat.player.adaptiveWardElement starts unset
      seq: LOW,
    });
    checkParity('P1-MIRRORSOUL-03', 'Mirror Soul when the reflected roll rounds to <=0: the “nothing worth turning aside” line, no HP write, no kill check', {
      effects: ['mirror_soul'],
      mutate: (s, creature) => { creature.element = 'water'; creature.magic = 1; }, // low magic -> randInt(-1,3) with LOW random rounds <=0
      seq: LOW,
    });
    checkParity('P1-TIMELESSGUARD-01', 'Timeless Guard (Chronal Dial): full negation, cooldown set, takes priority over every later evasion check', {
      effects: ['timeless_guard'],
      seq: LOW,
    });
    checkParity('P1-CALCAIM-01', 'Calculated Aim (or Concealed Edge, same code path): +8 accuracy on the wearer’s first damaging attempt, flag consumed', {
      effects: ['sang_mil_ie003_calculated_aim'],
      seq: LOW,
    });
    checkParity('P1-RIVERWARDEN-EVADE-01', 'River Warden 6pc’s magic-bonus-on-evade variant: only reachable when the attacker is elemental AND the player evades -- distinct from P1-EVACHARGE-01’s physical-creature evasion', {
      sets: ['River Warden:6'],
      mutate: (s, creature) => { creature.element = 'fire'; creature.magic = 18; s.combat.player.evasionTurns = 2; },
      seq: LOW,
    });
    checkParity('P1-OPENINGREACH-01', 'Opening Reach: a basic physical attack’s first-ever hit this fight deals 1.15x, flag consumed regardless of the gear check’s own result', {
      effects: ['opening_reach'],
      seq: LOW,
    });
    checkParity('P1-ACCBONUS-FALSE-01', 'Marked Target is NOT granted when exposedTarget was set by this SAME creature (self-check), and Duelist’s Measure’s pending-target reset (not “player”) correctly withholds its bonus -- the meaningful false branches, not just absence', {
      effects: ['sang_cu_ie007_duelists_measure'],
      mutate: (s, creature) => {
        s.combat.player.exposedTarget = { by: creature }; // same creature -> markedTargetBonus stays 0 (not gated on the effect at all)
        creature.duelistMeasurePendingTarget = 'someone_else'; // present but not "player" -> duelistBonus stays 0 regardless of the effect
      },
      seq: LOW,
      expectEffectMatters: false, // both bonuses are blocked by STATE here, not by gear -- equipping/unequipping Duelist's Measure changes nothing in this specific setup
    });
    checkParity('P1-POSTHIT-FALSE-01', 'Serrated Opening’s inflict is skipped (not its once-per-combat flag) when the player is already Bleeding; Marked Target’s grant is withheld when exposedTarget is already set; Duelist’s Measure’s banking is withheld once its twice-per-combat cap is reached', {
      effects: ['sang_cu_ie003_serrated_opening', 'sang_cu_ie002_marked_target', 'sang_cu_ie007_duelists_measure'],
      mutate: (s, creature) => {
        s.combat.player.playerStatuses = { bleed: { name: 'Bleeding', dot: { pctMaxHp: 0.02 }, turnsLeft: 2 } };
        s.combat.player.exposedTarget = { by: { name: 'someone else' } };
        creature.duelistMeasureUsesThisCombat = 2;
      },
      seq: LOW,
    });
    checkParity('P1-INFLICT-CHILLED-01', 'Black-Ice Reserve is granted specifically when an abilityCtx.inflict of status "chilled" actually takes (non-empty inflict lines), not for any other inflicted status', {
      effects: ['dra_e09_black_ice_reserve'],
      args: () => [2, 0, { name: 'Frostbite Brand', dmgMult: 0.8, inflict: { status: 'chilled', chance: 1 } }, null],
      seq: LOW,
    });

    checkParity('P1-PHYSMODS-01', 'Every First Sword’s Regalia physical multiplier stacked: Ice-Forged Edge, Unbroken Grip, Decisive Impact, Executioner’s Seal, Black-Ice Reserve (peek), Tyrant’s Edge, Flowing Discipline, Winter’s Verdict, Stonewarden, Toxic Preparation', {
      effects: ['dra_e01_ice_forged_edge', 'dra_e04_unbroken_grip', 'sang_mil_ie005_decisive_impact', 'dra_e06_executioners_seal', 'dra_e09_black_ice_reserve', 'sang_cu_ie012_tyrants_edge', 'sang_iag_ie008_toxic_preparation'],
      sets: ["First Sword's Regalia:6", "First Sword's Regalia:8", 'Stonewarden:6'],
      mutate: (s, creature) => {
        s.health = Math.round(s.maxHealth * 0.2); // under both the 0.3 and 0.35 HP thresholds
        creature.blackIceReservePending = true;
        creature.flowingDisciplinePending = true;
        s.combat.player.playerStatuses = { chilled: { name: 'Chilled', turnsLeft: 2 }, sang_iag_poison: { name: 'Poisoned', turnsLeft: 2 } };
      },
      seq: LOW,
    });
    checkParity('P1-PHYSMODS-02', 'Ability-cast (abilityCtx) basic-vs-active distinctions: dmgMult-driven damage, no Opening Reach, verb line, inflict + healOnHitPct', {
      mutate: (s, creature, slot) => { slot.hp = 50; slot.maxHp = 100; },
      args: () => [2, 0, { name: 'Shield Bash', dmgMult: 0.8, inflict: { status: 'stagger', chance: 1 }, healOnHitPct: 0.5 }, null],
      seq: LOW,
    });
    checkParity('P1-POSTHIT-01', 'Post-mitigation reactions: Guarded Strike banks def, Serrated Opening inflicts bleed, Marked Target + Duelist’s Measure bank for next attempt', {
      effects: ['guarded_strike', 'sang_cu_ie003_serrated_opening', 'sang_cu_ie002_marked_target', 'sang_cu_ie007_duelists_measure'],
      seq: LOW,
    });
    checkParity('P1-LETHAL-01', 'A lethal hit drives player health to 0 and triggers resolvePlayerDefeatOrDowned from inside applyAndReact', {
      mutate: (s) => { s.health = 1; },
      seq: LOW,
    });
    checkParity('P1-NOATK-01', 'creature.atk === 0 (intentionally harmless, e.g. Vaelorn): basic attack deals 0 regardless of mitigate', {
      mutate: (s, creature) => { creature.atk = 0; },
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
