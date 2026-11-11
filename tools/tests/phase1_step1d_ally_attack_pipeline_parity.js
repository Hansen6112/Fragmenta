// Layer 1 (forced-roll unit parity), Combat Rebuild Phase 1 step 1d: the
// ally-attacks-enemy path, moved onto the five-step pipeline. Three
// structurally different shapes, each compared against its own kept,
// unchanged oracle:
//   - allyAggressiveActionLegacy vs allyAggressiveAction (plain ally, no
//     abilityKit -- Kessa today)
//   - basicCompanionAttackLegacy vs basicCompanionAttack (a kit-bearing
//     ally's fallback basic swing -- Hadrian today)
//   - useHadrianActiveLegacy vs useHadrianActive (Hadrian's full kit --
//     taunts/heal/ultimate branches are untouched code either way;
//     Crushing Blow/Groundbreaker's direct-damage tail is the one that
//     actually moved)
//   - maybeCompanionRetaliateLegacy vs maybeCompanionRetaliate (step
//     1f-iii §4: Last Bastion's automatic retaliation, now routed
//     through resolveCompanionRetaliation, pipeline.js)
//
// Step 1h-ii has now deleted all four *Legacy functions above (and the
// other 11 doomed functions elsewhere) -- this file no longer calls any
// of them. Every scenario's oldRun comes from the frozen fixture at
// tools/tests/fixtures/phase1_step1d_ally_attack_pipeline_parity.json,
// captured in step 1h-i (freeze_legacy_oracles.js) while the oracles
// still existed.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'phase1_step1d_ally_attack_pipeline_parity.json');
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

    function addSecondEnemy(s) {
      const template = BESTIARY['stoneback_beetle'];
      const creature2 = buildFightCreature(template, 25, template.dangerClass, 'stoneback_beetle');
      const record2 = buildSummonedEnemyRecord('stoneback_beetle', creature2, 'test', false, null, true);
      s.combat.enemies.push(record2);
      return record2;
    }

    function makeWarriorWithAllies() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      const kessa = s.recruitAlly('kessa');
      const hadrian = s.recruitAlly('hadrian');
      startCombat(s, 'stoneback_beetle', 25);
      addSecondEnemy(s);
      ensureCompanionFields(hadrian);
      return { s, kessa, hadrian, kit: ALLY_DEFS.hadrian.abilityKit };
    }

    const LOW = Array(40).fill(0.02);
    const HIGH = Array(40).fill(0.98);
    const MID = Array(40).fill(0.5);

    // Sorted-key stringify: step 1d deliberately moves WHEN a couple of
    // enemy fields (Brace/Guarded Strike/Sure Foundation's bank) get
    // their first write from calculateDamage to applyAndReact (step 5,
    // per the stat()-purity rule -- see pipeline.js's own header on this
    // file's ally-actor branches). That changes which property gets
    // inserted into the creature object FIRST, which a plain
    // JSON.stringify would (wrongly) read as a snapshot mismatch even
    // though every value is identical -- sorting keys first makes the
    // comparison insensitive to insertion order, same as any real
    // consumer of this data (nothing reads these objects positionally).
    function sortedStringify(obj) {
      return JSON.stringify(obj, (key, value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return Object.keys(value).sort().reduce((acc, k) => { acc[k] = value[k]; return acc; }, {});
        }
        return value;
      });
    }
    function snapshot(s) {
      return sortedStringify({ combat: s.combat, party: s.party });
    }

    // scenario: { effects: [ids], sets: ["Name:tier"], mutate(s, kessa, hadrian, kit, enemies),
    //   seq: [randoms] }
    function runOne(fn, argsFn, scenario) {
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
        const { s, kessa, hadrian, kit } = makeWarriorWithAllies();
        const enemies = s.combat.enemies;
        if (scenario.mutate) scenario.mutate(s, kessa, hadrian, kit, enemies);
        const args = argsFn(s, kessa, hadrian, kit, enemies);
        const result = fn(...args);
        return { result, snap: snapshot(s) };
      } finally {
        Math.random = origRandom;
        window.hasEffect = origHasEffect;
        window.hasSetTier = origHasSetTier;
      }
    }

    function effectControlCheck(fn, argsFn, scenario) {
      const hasToggle = (scenario.effects && scenario.effects.length) || (scenario.sets && scenario.sets.length);
      if (!hasToggle) return { applicable: false, mattered: null };
      if (scenario.expectEffectMatters === false) return { applicable: true, expectMatters: false, mattered: null, skippedCheck: true };
      const bare = Object.assign({}, scenario, { effects: [], sets: [] });
      const withoutEffect = runOne(fn, argsFn, bare);
      const withEffect = runOne(fn, argsFn, scenario);
      const mattered = JSON.stringify(withEffect.result) !== JSON.stringify(withoutEffect.result) || withEffect.snap !== withoutEffect.snap;
      return { applicable: true, expectMatters: true, mattered };
    }

    function checkParity(code, description, newFn, argsFn, scenario) {
      record(code, description, () => {
        const oldRun = frozenIn[code];
        const newRun = runOne(newFn, argsFn, scenario);
        const resultMatch = JSON.stringify(oldRun.result) === JSON.stringify(newRun.result);
        const snapMatch = oldRun.snap === newRun.snap;
        const control = effectControlCheck(newFn, argsFn, scenario);
        const controlOk = !control.applicable || control.skippedCheck || control.mattered === control.expectMatters;
        return {
          pass: resultMatch && snapMatch && controlOk,
          resultMatch, snapMatch, controlOk,
          oldResult: oldRun.result, newResult: newRun.result,
          effectControl: control.applicable ? { expectMatters: control.expectMatters, mattered: control.mattered, skippedCheck: !!control.skippedCheck } : 'n/a',
        };
      });
    }

    // ============ Kessa: allyAggressiveActionLegacy vs allyAggressiveAction ============
    const kessaArgs = (s, kessa) => [s, kessa];

    checkParity('P1D-K-HIT-01', 'Kessa: a plain connecting hit, no gear effects', allyAggressiveAction, kessaArgs, { seq: LOW });
    checkParity('P1D-K-HIT-02', 'Kessa: mid-range random rolls (exercises the randInt spread)', allyAggressiveAction, kessaArgs, { seq: MID });
    checkParity('P1D-K-MISS-01', 'Kessa: a miss provokes riposteCounterByEnemyOnAlly when the enemy wears Riposte', allyAggressiveAction, kessaArgs, {
      effects: ['riposte'],
      seq: HIGH,
    });
    // Step 1f-iii §4: P1D-K-MISS-01 above only exercises the non-lethal
    // counter-strike. riposteCounterByEnemyOnAlly now runs through
    // resolveRiposteCounterByEnemyOnAlly (pipeline.js) -- this forces the
    // counter to kill Kessa, exercising the dedicated reaction tail's
    // own killAlly call.
    checkParity('P1F3-RIPOSTE-ENEMY-ONALLY-KILL-01', 'Kessa: a miss provokes a counter-strike from a Riposte-wearing enemy that kills her', allyAggressiveAction, kessaArgs, {
      effects: ['riposte'],
      mutate: (s, kessa) => { kessa.health = 1; kessa.maxHealth = 1; },
      seq: HIGH,
    });
    checkParity('P1D-K-BANKEDDEF-01', "Kessa: the enemy's banked Brace/Guarded Strike Defense is read AND consumed exactly once (peeked in calculateDamage, zeroed in applyAndReact)", allyAggressiveAction, kessaArgs, {
      mutate: (s, kessa, hadrian, kit, enemies) => { enemies[0].creatureObj.braceBonusDef = 3; enemies[0].creatureObj.guardedStrikeBonusDef = 2; },
      seq: LOW,
    });
    checkParity('P1D-K-SUREFOUND-01', "Kessa: Sure Foundation (DRA-E05) re-grants itself +2/2turns immediately after being consumed", allyAggressiveAction, kessaArgs, {
      effects: ['dra_e05_sure_foundation'],
      mutate: (s, kessa, hadrian, kit, enemies) => { enemies[0].creatureObj.sureFoundationBonusDef = 2; },
      seq: LOW,
    });
    checkParity('P1D-K-GUARDEDSTRIKE-01', 'Kessa: landing a hit while wearing Guarded Strike banks +2 Defense for herself', allyAggressiveAction, kessaArgs, {
      effects: ['guarded_strike'],
      seq: LOW,
    });
    checkParity('P1D-K-OPENINGREACH-01', "Kessa: Opening Reach's 1.15x on her first physical attack this fight", allyAggressiveAction, kessaArgs, {
      effects: ['opening_reach'],
      seq: LOW,
    });
    checkParity('P1D-K-DMGREDUCTION-01', 'Kessa: the target enemy\'s own dmgReduction (Guarded Stance et al) reduces her damage', allyAggressiveAction, kessaArgs, {
      mutate: (s, kessa, hadrian, kit, enemies) => { enemies[0].creatureObj.dmgReduction = 0.25; },
      seq: LOW,
    });
    checkParity('P1D-K-SANGMIT-01', "Kessa: the enemy's own Smuggler's Guard/Commander's Poise mitigation vs her attack", allyAggressiveAction, kessaArgs, {
      effects: ['sang_cu_ie006_smugglers_guard', 'sang_cu_ie011_commanders_poise'],
      seq: LOW,
    });
    checkParity('P1D-K-EXECUTIONER-01', "Kessa: executionerMultiplierFor's finisher bonus against a badly wounded target", allyAggressiveAction, kessaArgs, {
      effects: ['executioner'],
      mutate: (s, kessa, hadrian, kit, enemies) => { enemies[0].hp = 1; },
      seq: LOW,
    });
    checkParity('P1D-K-KILL-01', 'Kessa: a lethal hit triggers resolveKill from inside applyAndReact', allyAggressiveAction, kessaArgs, {
      mutate: (s, kessa, hadrian, kit, enemies) => { enemies[0].hp = 1; enemies[0].maxHp = 1; },
      seq: LOW,
    });

    // ============ Hadrian basic fallback: basicCompanionAttackLegacy vs basicCompanionAttack ============
    const hadrianBasicArgs = (s, kessa, hadrian, kit, enemies) => [s, hadrian, enemies];

    checkParity('P1D-HB-HIT-01', 'Hadrian basic: a plain connecting hit', basicCompanionAttack, hadrianBasicArgs, { seq: LOW });
    checkParity('P1D-HB-MISS-01', "Hadrian basic: a miss never provokes the enemy's Riposte (asymmetry preserved vs Kessa's miss)", basicCompanionAttack, hadrianBasicArgs, {
      effects: ['riposte'],
      seq: HIGH,
      expectEffectMatters: false,
    });
    checkParity('P1D-HB-VETERAN-01', 'Hadrian basic: Veteran of a Hundred Battles raises his Accuracy via healthLostPctThisCombat', basicCompanionAttack, hadrianBasicArgs, {
      mutate: (s, kessa, hadrian) => { hadrian.level = 25; hadrian.healthLostPctThisCombat = 0.5; },
      seq: MID,
    });
    checkParity('P1D-HB-WORTHYFOE-01', "Hadrian basic: Astra Sa'Lahru's Broken Crest's tier-based outgoing damage bonus", basicCompanionAttack, hadrianBasicArgs, {
      mutate: (s, kessa, hadrian, kit, enemies) => { hadrian.equipment.trinkets = ["Astra Sa'Lahru's Broken Crest"]; enemies[0].creatureObj.dangerClass = 'boss'; },
      seq: LOW,
    });
    checkParity('P1D-HB-FINALRESPECT-01', 'Hadrian basic: a pending finalRespectPct bonus is applied and consumed', basicCompanionAttack, hadrianBasicArgs, {
      mutate: (s, kessa, hadrian) => { hadrian.finalRespectPct = 0.5; },
      seq: LOW,
    });
    checkParity('P1D-HB-KILL-01', 'Hadrian basic: a lethal hit kills via killEnemyAsAlly and fires onHadrianKill (Paid in Blood if ascended)', basicCompanionAttack, hadrianBasicArgs, {
      mutate: (s, kessa, hadrian, kit, enemies) => { enemies[0].hp = 1; enemies[0].maxHp = 1; },
      seq: LOW,
    });

    // ============ Hadrian's kit: useHadrianActiveLegacy vs useHadrianActive ============
    const cbAbility = (kit) => kit.actives.find((a) => a.id === 'crushing_blow');
    const gbAbility = (kit) => kit.actives.find((a) => a.id === 'groundbreaker');
    const shieldingAbility = (kit) => kit.actives.find((a) => a.id === 'shielding_presence');
    const unyieldingAbility = (kit) => kit.actives.find((a) => a.id === 'unyielding_advance');
    const arenaAbility = (kit) => kit.actives.find((a) => a.id === 'arena_incarnate');

    const cbArgs = (s, kessa, hadrian, kit, enemies) => [s, hadrian, kit, cbAbility(kit), enemies];
    checkParity('P1D-HA-CB-HIT-01', 'Hadrian Crushing Blow: a plain connecting hit', useHadrianActive, cbArgs, { seq: LOW });
    checkParity('P1D-HA-CB-MISS-01', 'Hadrian Crushing Blow: a miss', useHadrianActive, cbArgs, { seq: HIGH });
    checkParity('P1D-HA-CB-EMPOWERED-01', "Hadrian Crushing Blow: consumes a pending Empowered Strike charge", useHadrianActive, cbArgs, {
      mutate: (s, kessa, hadrian) => { hadrian.empoweredStrikePct = 0.3; hadrian.empoweredStrikeTurnsLeft = 2; },
      seq: LOW,
    });
    checkParity('P1D-HA-CB-ASCENDED-01', "Hadrian Crushing Blow: the ascended Legendary Regalia's extra Defense-ignore (Unbroken Momentum)", useHadrianActive, cbArgs, {
      mutate: (s, kessa, hadrian) => {
        for (const [slot, name] of Object.entries(HADRIAN_ASCENSION_MAP)) hadrian.equipment[slot] = name;
      },
      seq: LOW,
    });
    checkParity('P1D-HA-CB-ULTIMATE-01', "Hadrian Crushing Blow: Arena Incarnate's active ultimateAtkPct window", useHadrianActive, cbArgs, {
      mutate: (s, kessa, hadrian) => { hadrian.ultimateTurnsLeft = 2; hadrian.ultimateAtkPct = 0.25; },
      seq: LOW,
    });
    checkParity('P1D-HA-CB-KILL-01', 'Hadrian Crushing Blow: a lethal hit kills via killEnemyAsAlly and fires onHadrianKill', useHadrianActive, cbArgs, {
      mutate: (s, kessa, hadrian, kit, enemies) => { enemies[0].hp = 1; enemies[0].maxHp = 1; },
      seq: LOW,
    });

    const gbArgs = (s, kessa, hadrian, kit, enemies) => [s, hadrian, kit, gbAbility(kit), enemies];
    checkParity('P1D-HA-GB-HIT-01', 'Hadrian Groundbreaker: primary hit + splash onto the second enemy + accuracy debuff on both', useHadrianActive, gbArgs, { seq: LOW });
    checkParity('P1D-HA-GB-MISS-01', 'Hadrian Groundbreaker: a miss on the primary skips splash entirely', useHadrianActive, gbArgs, { seq: HIGH });
    checkParity('P1D-HA-GB-ASCENDED-01', "Hadrian Groundbreaker: the ascended Legendary Regalia's extra splash multiplier", useHadrianActive, gbArgs, {
      mutate: (s, kessa, hadrian) => {
        for (const [slot, name] of Object.entries(HADRIAN_ASCENSION_MAP)) hadrian.equipment[slot] = name;
      },
      seq: LOW,
    });
    checkParity('P1D-HA-GB-SPLASHKILL-01', "Hadrian Groundbreaker: a splash-only kill on the SECOND enemy still sets killedAny and fires onHadrianKill", useHadrianActive, gbArgs, {
      mutate: (s, kessa, hadrian, kit, enemies) => { enemies[1].hp = 1; enemies[1].maxHp = 1; },
      seq: LOW,
    });

    // Non-damage branches: untouched code, but re-verified for regression
    // safety since useHadrianActiveLegacy/useHadrianActive both got a
    // large edit in this same commit.
    const shieldArgs = (s, kessa, hadrian, kit, enemies) => [s, hadrian, kit, shieldingAbility(kit), enemies];
    checkParity('P1D-HA-TAUNT-01', "Hadrian Shielding Presence: a pure self-buff, no damage, no target roll at all", useHadrianActive, shieldArgs, { seq: MID });
    const unyieldingArgs = (s, kessa, hadrian, kit, enemies) => [s, hadrian, kit, unyieldingAbility(kit), enemies];
    checkParity('P1D-HA-HEAL-01', 'Hadrian Unyielding Advance: self-heal + Empowered Strike window, no damage', useHadrianActive, unyieldingArgs, { seq: MID });
    const arenaArgs = (s, kessa, hadrian, kit, enemies) => [s, hadrian, kit, arenaAbility(kit), enemies];
    checkParity('P1D-HA-ULT-01', 'Hadrian Arena Incarnate: self-buff window, no damage', useHadrianActive, arenaArgs, { seq: MID });

    // Step 1e completion handoff (9 Nov 2026 follow-up): useHadrianActive's
    // three `ability.id === "..."` non-damage blocks were replaced with a
    // generic "apply whichever fields this ability's own data declares"
    // dispatch. Shielding Presence/Unyielding Advance/Arena Incarnate
    // above already re-verify that generic dispatch for their own field
    // subsets -- these two add the subsets ONLY Champion's Challenge
    // (bonusDef) and Last Bastion (retaliatePct) exercise within the same
    // tauntTurns-gated branch, previously untested.
    const champsAbility = (kit) => kit.actives.find((a) => a.id === 'champions_challenge');
    const champsArgs = (s, kessa, hadrian, kit, enemies) => [s, hadrian, kit, champsAbility(kit), enemies];
    checkParity('P1D-HA-CHAMPS-01', "Hadrian Champion's Challenge: taunt + bonusDef, no damage", useHadrianActive, champsArgs, { seq: MID });
    const bastionAbility = (kit) => kit.actives.find((a) => a.id === 'last_bastion');
    const bastionArgs = (s, kessa, hadrian, kit, enemies) => [s, hadrian, kit, bastionAbility(kit), enemies];
    checkParity('P1D-HA-BASTION-01', 'Hadrian Last Bastion: taunt + dmgReduction + retaliatePct, no damage', useHadrianActive, bastionArgs, { seq: MID });

    // Step 1f-iii §4: Last Bastion's own automatic retaliation
    // (maybeCompanionRetaliate -> resolveCompanionRetaliation, pipeline.js)
    // against maybeCompanionRetaliateLegacy -- the same forced-roll
    // parity shape as every other moved ally function above, applied to
    // the one function this file hadn't covered yet (it's called from
    // resolveEnemyAttackOnAlly's own tail, not from useHadrianActive).
    const retaliateArgs = (s, kessa, hadrian, kit, enemies) => [s, hadrian, enemies[0].creatureObj];
    checkParity('P1F3-RETALIATE-OFF-01', 'maybeCompanionRetaliate: no-op when retaliateTurnsLeft is 0 (Last Bastion not active)', maybeCompanionRetaliate, retaliateArgs, { seq: MID });
    checkParity('P1F3-RETALIATE-HIT-01', 'maybeCompanionRetaliate: Last Bastion active, a normal (non-lethal) counter-strike against the attacker -- no to-hit roll, always lands', maybeCompanionRetaliate, retaliateArgs, {
      mutate: (s, kessa, hadrian) => { hadrian.retaliateTurnsLeft = 2; hadrian.retaliatePct = 0.5; },
      seq: MID,
    });
    checkParity('P1F3-RETALIATE-KILL-01', 'maybeCompanionRetaliate: a lethal counter-strike kills via killEnemyAsAlly and fires onHadrianKill', maybeCompanionRetaliate, retaliateArgs, {
      mutate: (s, kessa, hadrian, kit, enemies) => { hadrian.retaliateTurnsLeft = 2; hadrian.retaliatePct = 0.5; enemies[0].hp = 1; enemies[0].maxHp = 1; },
      seq: MID,
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  }, frozenIn);

  console.log(`Step 1d ally-attack parity: ${out.summary.passed}/${out.summary.total} passed`);
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
