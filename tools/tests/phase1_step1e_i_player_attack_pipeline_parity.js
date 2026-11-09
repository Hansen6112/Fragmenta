// Layer 1 (forced-roll unit parity), Combat Rebuild Phase 1 step 1e-i:
// the player's basic attack, moved onto the five-step pipeline.
// playerAttackLegacy (combat.js, byte-identical) is the kept oracle;
// playerAttack (pipeline.js) is the new pipeline-backed definition. Every
// scenario compares the two FULL orchestrator calls (not just the
// sub-functions), the same convention phase1_step1d's own Kessa/Hadrian
// comparisons use, so the surrounding turn bookkeeping this step did NOT
// touch (beginTurn, resolveSpeedInitiative, the rest of the round's
// initiative order, low-health/evasion/Riposte checks) is re-verified
// for regression safety too, not just the attack roll in the middle.
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

    function makeWarrior() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
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
      startCombat(s, 'stoneback_beetle', 25);
      return s;
    }

    const LOW = Array(40).fill(0.02);
    const HIGH = Array(40).fill(0.98);
    const MID = Array(40).fill(0.5);

    // Sorted-key stringify: same reason phase1_step1d's own harness needs
    // one -- this step's Brace/Guarded Strike/Sure Foundation/Siege Corps
    // peek-then-defer reorder changes WHEN a field gets its first write,
    // which a plain JSON.stringify is (wrongly) sensitive to even when
    // every value is identical.
    function sortedStringify(obj) {
      return JSON.stringify(obj, (key, value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return Object.keys(value).sort().reduce((acc, k) => { acc[k] = value[k]; return acc; }, {});
        }
        return value;
      });
    }
    function snapshot(s) {
      return sortedStringify({ combat: s.combat, health: s.health, party: s.party });
    }

    // scenario: { effects: [ids], sets: ["Name:tier"], mutate(s, creature), seq: [randoms], useMage: bool }
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

    function checkParity(code, description, legacyFn, newFn, scenario) {
      record(code, description, () => {
        const oldRun = runOne(legacyFn, scenario);
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

    // ============ Basic hit/miss ============
    checkParity('P1E-I-HIT-01', 'Plain physical hit, low-range rolls', playerAttackLegacy, playerAttack, { seq: LOW });
    checkParity('P1E-I-HIT-02', 'Plain physical hit, mid-range rolls (exercises the randInt spread)', playerAttackLegacy, playerAttack, { seq: MID });
    checkParity('P1E-I-MISS-01', 'A miss provokes riposteCounterOnPlayer when the enemy wears Riposte', playerAttackLegacy, playerAttack, {
      effects: ['riposte'],
      seq: HIGH,
    });

    // ============ Spell branch ============
    checkParity('P1E-I-SPELL-01', 'A mage\'s basic attack uses the spell formula', playerAttackLegacy, playerAttack, { seq: LOW, useMage: true });
    checkParity('P1E-I-SPELL-ELEMENTMULT-01', "A mage's basic attack reads the target's elemental matchup", playerAttackLegacy, playerAttack, {
      seq: LOW, useMage: true,
      mutate: (s, creature) => { creature.element = 'water'; },
    });

    // ============ Crit ============
    checkParity('P1E-I-CRIT-01', 'A guaranteed crit (Unlikely Outcome flag) applies its multiplier and consumes the flag', playerAttackLegacy, playerAttack, {
      seq: LOW,
      mutate: (s) => { s.combat.unlikelyOutcomeGuaranteedCrit = true; },
    });

    // ============ Enemy Defense: banked Brace/Guarded Strike/Sure Foundation ============
    checkParity('P1E-I-BANKEDDEF-01', "The enemy's banked Brace/Guarded Strike Defense is read AND consumed exactly once (peeked in step 4, zeroed in step 5)", playerAttackLegacy, playerAttack, {
      seq: LOW,
      mutate: (s, creature) => { creature.braceBonusDef = 3; creature.guardedStrikeBonusDef = 2; },
    });
    checkParity('P1E-I-SUREFOUND-01', 'Sure Foundation (DRA-E05): physical hit consumes it and re-grants it immediately', playerAttackLegacy, playerAttack, {
      effects: ['dra_e05_sure_foundation'],
      mutate: (s, creature) => { creature.sureFoundationBonusDef = 2; },
      seq: LOW,
    });
    checkParity('P1E-I-SUREFOUND-SPELL-01', 'Sure Foundation never applies to a spell hit ("magic bypasses it") -- present or not, the spell hit is identical', playerAttackLegacy, playerAttack, {
      effects: ['dra_e05_sure_foundation'],
      mutate: (s, creature) => { creature.sureFoundationBonusDef = 2; },
      seq: LOW, useMage: true,
      expectEffectMatters: false,
    });

    // ============ Siege Corps one-shot Attack charge (step 1e handoff §3.2 purity fix) ============
    checkParity('P1E-I-SIEGECORPS-01', 'Siege Corps\' one-shot +2 Attack charge is peeked in step 4 (stat()) and consumed exactly once in step 5 -- produces the identical roll as the legacy eager-consume formula', playerAttackLegacy, playerAttack, {
      seq: LOW,
      mutate: (s) => { s.combat.siegeCorpsAtkCharge = 2; },
    });

    // ============ Opening Reach / Borrowed Seconds / Feint ============
    checkParity('P1E-I-OPENINGREACH-01', "Opening Reach's 1.15x on the first physical attack this fight", playerAttackLegacy, playerAttack, {
      effects: ['opening_reach'],
      seq: LOW,
    });
    checkParity('P1E-I-BORROWEDSECONDS-01', "Borrowed Seconds' every-4th-action +15% (actionCounter hits a multiple of 4 inside beginTurn)", playerAttackLegacy, playerAttack, {
      effects: ['borrowed_seconds'],
      mutate: (s) => { s.combat.actionCounter = 3; },
      seq: LOW,
    });
    checkParity('P1E-I-FEINT-01', 'A pending Feint bonus (nextAttackBonus) applies its 1.6x and is consumed', playerAttackLegacy, playerAttack, {
      seq: LOW,
      mutate: (s) => { s.combat.nextAttackBonus = true; },
    });
    checkParity('P1E-I-FEINT-PATIENTAIM-01', 'Patient Aim raises the Feint multiplier to 1.75x', playerAttackLegacy, playerAttack, {
      effects: ['patient_aim'],
      mutate: (s) => { s.combat.nextAttackBonus = true; },
      seq: LOW,
    });

    // ============ Kill / non-kill reactions ============
    checkParity('P1E-I-KILL-01', 'A lethal hit kills via resolveKill and re-targets the survivor', playerAttackLegacy, playerAttack, {
      mutate: (s, creature) => { s.combat.enemies[0].hp = 1; s.combat.enemies[0].maxHp = 1; },
      seq: LOW,
    });
    checkParity('P1E-I-PHYSONHIT-01', 'A non-kill physical hit runs applyPhysicalOnHitEffects (Hamstring)', playerAttackLegacy, playerAttack, {
      effects: ['hamstring'],
      seq: LOW,
    });
    checkParity('P1E-I-ARENARIPOSTE-01', 'A non-kill hit against an Arena-Riposte-bearing enemy triggers its counter-strike', playerAttackLegacy, playerAttack, {
      seq: LOW,
      mutate: (s, creature) => { creature.passives = ['sang_sec_arena_riposte']; },
    });
    checkParity('P1E-I-ENEMYPASSIVE-FLATREDUCTION-01', "A non-kill hit against a flatDamageReduction-passive enemy (Thick Hide) reduces the landed damage", playerAttackLegacy, playerAttack, {
      seq: LOW,
      mutate: (s, creature) => { creature.passives = ['thick_hide']; },
    });
    checkParity('P1E-I-ENEMYPASSIVE-ONHITTAKEN-01', "A non-kill hit against an onHitTaken-passive enemy (Barbed Hide) reflects damage back onto the player", playerAttackLegacy, playerAttack, {
      seq: LOW,
      mutate: (s, creature) => { creature.passives = ['barbed_hide']; },
    });

    // ============ Gear-driven multipliers ============
    checkParity('P1E-I-SANGMIT-01', "The enemy's own Smuggler's Guard/Commander's Poise mitigation vs the player's attack", playerAttackLegacy, playerAttack, {
      effects: ['sang_cu_ie006_smugglers_guard', 'sang_cu_ie011_commanders_poise'],
      seq: LOW,
    });
    checkParity('P1E-I-EXECUTIONER-01', "Executioner's finisher bonus against a badly wounded target", playerAttackLegacy, playerAttack, {
      effects: ['executioner'],
      mutate: (s, creature) => { s.combat.enemies[0].hp = 1; },
      seq: LOW,
    });
    checkParity('P1E-I-TEMPEREDSTEEL-01', "Tempered Steel's permanent stack growth after a successful hit", playerAttackLegacy, playerAttack, {
      effects: ['tempered_steel'],
      seq: LOW,
    });
    checkParity('P1E-I-SOULLEECH-01', "Soul Leech heals the player for a fraction of the hit's damage", playerAttackLegacy, playerAttack, {
      effects: ['soul_leech'],
      mutate: (s) => { s.health = Math.max(1, s.maxHealth - 20); },
      seq: LOW,
    });
    checkParity('P1E-I-GUARDEDSTRIKE-01', "Guarded Strike's guardBonus threads through to the round's remaining initiative actions (isPhysicalHit)", playerAttackLegacy, playerAttack, {
      effects: ['guarded_strike'],
      seq: LOW,
    });

    // ============ Avatar of Creation: permanent per-branch stat stacks ============
    checkParity('P1E-I-AVATARCREATION-PHYS-01', 'Avatar of Creation grows Attack stacks permanently on a physical hit', playerAttackLegacy, playerAttack, {
      seq: LOW,
      mutate: (s) => { s.combat.avatarOfCreationTurns = 2; },
    });
    checkParity('P1E-I-AVATARCREATION-SPELL-01', 'Avatar of Creation grows Magic stacks permanently on a spell hit instead', playerAttackLegacy, playerAttack, {
      seq: LOW, useMage: true,
      mutate: (s) => { s.combat.avatarOfCreationTurns = 2; },
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`Step 1e-i player basic-attack parity: ${out.summary.passed}/${out.summary.total} passed`);
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
