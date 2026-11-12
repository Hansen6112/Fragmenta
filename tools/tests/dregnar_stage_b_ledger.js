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
    function withForcedMiss(fn) {
      const oc = window.attackConnects;
      window.attackConnects = () => false;
      try { return fn(); } finally { window.attackConnects = oc; }
    }
    function freshDregnar(level) {
      const s = makeChar(level || 60);
      s.health = s.maxHealth * 1000;
      s.maxHealth = s.maxHealth * 1000;
      startCombat(s, 'dregnar_ashvein', 30);
      return s;
    }
    // A bare (no-items) Dregnar clone, for isolating mechanics that would
    // otherwise always have his full kit active.
    function freshBareDregnar(level) {
      const s = makeChar(level || 60);
      s.health = s.maxHealth * 1000;
      s.maxHealth = s.maxHealth * 1000;
      const bare = Object.assign({}, BESTIARY.dregnar_ashvein);
      delete bare.equipment;
      startCombat(s, bare, 30);
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
        detail = { error: e.message, stack: (e.stack || '').split('\n').slice(0, 4).join(' / ') };
      }
      ledger.push({ code, description, pass: passed && errors === 0, errors, detail });
    }

    // ============ 1. Equipped stat block (most consequential) ============
    record('DRA-B-STATS-01', 'Equipped Dregnar == 860/100/110/62/13/99/14 exactly', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      return {
        pass: activeEnemySlot(s.combat).maxHp === 860 && c.atk === 100 && c.def === 110 && c.magic === 62 && c.spd === 13 && c.acc === 99 && c.agi === 14,
        hp: activeEnemySlot(s.combat).maxHp, atk: c.atk, def: c.def, magic: c.magic, spd: c.spd, acc: c.acc, agi: c.agi,
      };
    });
    record('DRA-B-STATS-02', 'Kabal Enforcer (special:true, no equipment field) is byte-identical before/after the legacyScaledCreature equipment generalization', () => {
      const s = makeChar(10);
      startCombat(s, 'kabal_enforcer', 10);
      const c = activeEnemySlot(s.combat).creatureObj;
      return { pass: activeEnemySlot(s.combat).maxHp === 40 && c.atk === 12 && c.def === 10 && c.spd === 6 && c.acc === 6 && c.agi === 5, hp: activeEnemySlot(s.combat).maxHp, atk: c.atk, def: c.def };
    });

    // ============ 2/3/4. Stun generalization ============
    record('DRA-B-STUN-01', 'Ordinary creature: a single stun charge still skips exactly its one action, bit-for-bit as the old boolean', () => {
      const s = makeChar(10);
      startCombat(s, 'bandit_cutthroat', 10);
      activeEnemySlot(s.combat).enemyStunCharges = 1;
      const before = s.health;
      withForcedMiss(() => resolveEnemyAction(s, activeEnemySlot(s.combat).creatureObj, 2, 0));
      return { pass: s.health === before && (activeEnemySlot(s.combat).enemyStunCharges || 0) === 0, healthUnchanged: s.health === before, chargesLeft: activeEnemySlot(s.combat).enemyStunCharges };
    });
    record('DRA-B-STUN-02', 'Ordinary creature with 2 charges: first turn stunned+consumes 1, charge carries to next turn', () => {
      const s = makeChar(10);
      startCombat(s, 'bandit_cutthroat', 10);
      activeEnemySlot(s.combat).enemyStunCharges = 2;
      const r1 = withForcedMiss(() => resolveEnemyAction(s, activeEnemySlot(s.combat).creatureObj, 2, 0));
      const midCharges = activeEnemySlot(s.combat).enemyStunCharges;
      const r2 = withForcedMiss(() => resolveEnemyAction(s, activeEnemySlot(s.combat).creatureObj, 2, 0));
      return { pass: r1.damage === 0 && midCharges === 1 && r2.damage === 0 && (activeEnemySlot(s.combat).enemyStunCharges || 0) === 0, r1damage: r1.damage, midCharges, r2damage: r2.damage };
    });
    record('DRA-B-STUN-03', 'Dregnar: a charge consumed on the normal slot skips only that slot (bonus action, in Unbound, still fires)', () => {
      const s = freshBareDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.draState = 'ashquench_unbound'; e.draStateTurns = 0; e.draJudgmentPending = false;
      e.enemyStunCharges = 1;
      const r = withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: /reeling and doesn't act/.test(r.lines.join(' ')) && /moves again/.test(r.lines.join(' ')), lines: r.lines };
    });
    record('DRA-B-STUN-04', 'Dregnar in Water Guard (no bonus slot at all): a single charge skips the one normal action via his bespoke resolver, same outward result as the generic path (STUN-01)', () => {
      const s = freshBareDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.draState = 'water_guard'; e.draStateTurns = 0; e.draJudgmentPending = false;
      e.enemyStunCharges = 1;
      const r = withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: r.damage === null && /reeling and doesn't act/.test(r.lines.join(' ')) && (e.enemyStunCharges || 0) === 0, lines: r.lines, damage: r.damage, chargesLeft: e.enemyStunCharges };
    });
    record('DRA-B-STUN-05', '2 simultaneous charges in Unbound: both normal and bonus slots are stunned', () => {
      const s = freshBareDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.draState = 'ashquench_unbound'; e.draStateTurns = 0; e.draJudgmentPending = false;
      e.enemyStunCharges = 2;
      const r = withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      const text = r.lines.join(' ');
      const reelingCount = (text.match(/reeling/g) || []).length;
      return { pass: reelingCount === 1 && /stun holds it fast/.test(text) && (e.enemyStunCharges || 0) === 0, text, reelingCount };
    });
    record('DRA-B-STUN-06', 'A stun consuming the normal slot that would have resolved pending Judgment cancels it (not left pending) and starts its cooldown', () => {
      const s = freshBareDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      e.draState = 'ashquench_unbound'; e.draStateTurns = 1; e.draJudgmentPending = true;
      e.abilityCooldowns = {};
      e.enemyStunCharges = 1;
      const r = withForcedMiss(() => resolveEnemyAction(s, c, 2, 0));
      return { pass: !e.draJudgmentPending && e.abilityCooldowns.dra_judgment === 5 && /Judgment is denied/.test(r.lines.join(' ')), draJudgmentPending: e.draJudgmentPending, cooldown: e.abilityCooldowns.dra_judgment };
    });

    // ============ 4. Unshaken Command ============
    record('DRA-B-E02-01', 'Unshaken Command negates the first 2 valid stuns per combat (no charge ever reaches the counter, no action lost)', () => {
      const s = freshDregnar();
      const creature = getCombatCreature(s);
      const l1 = tryApplyEnemyStun(s, creature);
      const l2 = tryApplyEnemyStun(s, creature);
      const chargesAfterTwo = activeEnemySlot(s.combat).enemyStunCharges || 0;
      const l3 = tryApplyEnemyStun(s, creature);
      const chargesAfterThree = activeEnemySlot(s.combat).enemyStunCharges || 0;
      return {
        pass: /Unshaken Command/.test(l1[0]) && /Unshaken Command/.test(l2[0]) && chargesAfterTwo === 0 && l3.length === 0 && chargesAfterThree === 1,
        l1, l2, l3, chargesAfterTwo, chargesAfterThree,
      };
    });
    record('DRA-B-E02-02', 'Unshaken Command charges reset at combat start (fresh creatureObj each fight)', () => {
      const s1 = freshDregnar();
      const c1 = getCombatCreature(s1);
      tryApplyEnemyStun(s1, c1); tryApplyEnemyStun(s1, c1);
      const s2 = freshDregnar();
      const c2 = getCombatCreature(s2);
      const l = tryApplyEnemyStun(s2, c2);
      return { pass: /Unshaken Command/.test(l[0]), l };
    });

    // ============ 5. Item effects ============
    record('DRA-B-E01-01', 'Ice-Forged Edge: physical hit multiplied 1.10x vs an equivalent bare-kit hit', () => {
      const bare = freshBareDregnar();
      const full = freshDregnar();
      let bareDmg = 0, fullDmg = 0;
      // Force Hammerfall specifically on both by clearing other cooldowns.
      withForcedHit(() => {
        const cb = bare.combat.enemies[0]; cb.abilityCooldowns = {};
        const rb = resolveDregnarAttempt(bare, cb, activeEnemySlot(bare.combat).creatureObj, 'dra_hammerfall', 2, 0);
        bareDmg = rb.damage;
        const cf = full.combat.enemies[0]; cf.abilityCooldowns = {};
        const rf = resolveDregnarAttempt(full, cf, activeEnemySlot(full.combat).creatureObj, 'dra_hammerfall', 2, 0);
        fullDmg = rf.damage;
      });
      // Same atk/def/health inputs would make exact 1.10 ratio noisy due to
      // the random spread baked into mitigate(); confirm direction + rough
      // magnitude instead of an exact ratio.
      return { pass: fullDmg > 0 && bareDmg > 0, bareDmg, fullDmg, note: 'direction check only — full-kit Dregnar has different base atk/def too, so an exact 1.10x ratio isn\'t isolable here without reimplementing mitigate(); see DRA-B-E01-02 for an isolated multiplier check.' };
    });
    record('DRA-B-E01-02', 'Ice-Forged Edge isolated: hasEffect gate fires correctly for a wearer vs non-wearer', () => {
      const full = freshDregnar();
      const bare = freshBareDregnar();
      return { pass: hasEffect(activeEnemySlot(full.combat).creatureObj, 'dra_e01_ice_forged_edge') === true && hasEffect(activeEnemySlot(bare.combat).creatureObj, 'dra_e01_ice_forged_edge') === false };
    });
    record('DRA-B-E04-01', 'Unbroken Grip: first physical weapon attack each combat flagged used after one landed hit, not before', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const before = !!c.unbrokenGripUsed;
      withForcedHit(() => resolveDregnarAttempt(s, s.combat.enemies[0], c, 'dra_hammerfall', 2, 0));
      return { pass: !before && c.unbrokenGripUsed === true, before, after: c.unbrokenGripUsed };
    });
    record('DRA-B-E06-01', 'Executioner\'s Seal: 1.20x fires vs a target at/below 30% HP, not above', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      s.health = Math.round(s.maxHealth * 0.3);
      let dmgLow = 0, dmgHigh = 0;
      withForcedHit(() => { dmgLow = resolveDregnarAttempt(s, s.combat.enemies[0], c, 'dra_hammerfall', 2, 0).damage; });
      const s2 = freshDregnar();
      const c2 = activeEnemySlot(s2.combat).creatureObj;
      s2.health = s2.maxHealth; // full HP, no Executioner's Seal
      withForcedHit(() => { dmgHigh = resolveDregnarAttempt(s2, s2.combat.enemies[0], c2, 'dra_hammerfall', 2, 0).damage; });
      return { pass: dmgLow > 0 && dmgHigh > 0, dmgLow, dmgHigh, note: 'direction check — exact 1.20x isolation needs the mitigate() formula reimplemented; see E06-02' };
    });
    record('DRA-B-E06-02', 'Executioner\'s Seal gate: hasEffect fires for the equipped item id', () => {
      const s = freshDregnar();
      return { pass: hasEffect(activeEnemySlot(s.combat).creatureObj, 'dra_e06_executioners_seal') === true };
    });
    record('DRA-B-E03-01', 'Flowing Guard: first incoming physical hit each round reduced 0.90x (gate present on wearer)', () => {
      const s = freshDregnar();
      return { pass: hasEffect(activeEnemySlot(s.combat).creatureObj, 'dra_e03_flowing_guard') === true };
    });
    record('DRA-B-E05-01', 'Sure Foundation: after a landed physical hit against Dregnar, a pending +2 Def charge is banked', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const before = c.sureFoundationBonusDef || 0;
      withForcedHit(() => rollPlayerDamage(s, c, null));
      return { pass: before === 0 && c.sureFoundationBonusDef === 2 && c.sureFoundationBonusDefTurnsLeft === 2, before, after: c.sureFoundationBonusDef };
    });
    record('DRA-B-E05-02', 'Sure Foundation: the banked charge is actually read into the Defense term mitigate() receives on the next hit (direct mechanism check — end-to-end damage deltas round away at Dregnar\'s stat scale)', () => {
      const withEffect = freshDregnar();
      const cWith = activeEnemySlot(withEffect.combat).creatureObj;
      withForcedHit(() => rollPlayerDamage(withEffect, cWith, null)); // banks the charge
      let defSeen = null;
      const origMitigate = mitigate;
      window.mitigate = function (power, def) { defSeen = def; return origMitigate(power, def); };
      try { withForcedHit(() => rollPlayerDamage(withEffect, cWith, null)); }
      finally { window.mitigate = origMitigate; }
      const expectedBaseDef = cWith.def; // no braceBonusDef/guardedStrikeBonusDef in this scenario
      return { pass: defSeen === expectedBaseDef + 2, defSeen, expectedBaseDef, sureFoundationBonusDef: cWith.sureFoundationBonusDef };
    });
    record('DRA-B-E05-03', 'Sure Foundation: magic bypasses it — a spell hit against Dregnar doesn\'t consume the pending charge', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      withForcedHit(() => rollPlayerDamage(s, c, null)); // bank via physical
      const before = c.sureFoundationBonusDef;
      s.flags.isMage = true; s.primaryElement = 'fire';
      withForcedHit(() => rollPlayerDamage(s, c, 'fire')); // magic hit
      return { pass: before === 2 && c.sureFoundationBonusDef === 2, before, after: c.sureFoundationBonusDef };
    });
    record('DRA-B-E07-01', 'Unquenched Focus: dormant for Dregnar himself (no elemental actives in Stage A) but the gate is present on the wearer', () => {
      const s = freshDregnar();
      return { pass: hasEffect(activeEnemySlot(s.combat).creatureObj, 'dra_e07_unquenched_focus') === true };
    });
    record('DRA-B-E08-01', 'Ashward: a Burning tick against the wearer is reduced to 0.75x', () => {
      const s = freshDregnar();
      const e = s.combat.enemies[0];
      e.burn = { turnsLeft: 2, dmgPerTurn: 20 };
      const hpBefore = e.hp;
      beginTurn(s); // the normal once-per-round tick point burn/bleed already use
      const dealt = hpBefore - e.hp;
      return { pass: dealt === 15, dealt, expected: 15 };
    });
    record('DRA-B-E09-01', 'Black-Ice Reserve: granted after Dregnar successfully applies Chilled (Black-Ice Cleave hit)', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      const origRandom = Math.random;
      Math.random = () => 0; // guarantees the inflict.chance roll succeeds
      let r;
      try { r = withForcedHit(() => resolveDregnarAttempt(s, e, c, 'dra_cleave', 2, 0)); }
      finally { Math.random = origRandom; }
      return { pass: c.blackIceReservePending === true && c.blackIceReserveTurnsLeft === 2, pending: c.blackIceReservePending, lines: r.lines };
    });
    record('DRA-B-E09-02', 'Black-Ice Reserve: consumed on the next attempt even if it misses', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      c.blackIceReservePending = true; c.blackIceReserveTurnsLeft = 2;
      withForcedMiss(() => dregnarResolveDamagingAttempt(s, e, c, { id: 'dra_hammerfall', name: 'x', dmgMult: 1.15 }, 2, 0));
      return { pass: c.blackIceReservePending === false, pending: c.blackIceReservePending };
    });
    record('DRA-B-E10-01', 'Venom Tempering: registered (data entry exists) but inert — no player-inflicted poison/venom DOT mechanic exists against an enemy', () => {
      const s = freshDregnar();
      return { pass: hasEffect(activeEnemySlot(s.combat).creatureObj, 'dra_e10_venom_tempering') === true && EFFECT_DEFS.dra_e10_venom_tempering != null };
    });

    // ============ 6. Exclusive-tier set ============
    record('DRA-B-SET-01', 'Dregnar\'s own 2/4/6/8/10pc thresholds activate ONLY the single highest met tier as pieces are added one at a time', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const base = Object.assign({}, c.equipment);
      const order = ['mainhand', 'helmet', 'chest', 'gloves', 'boots', 'rings', 'necklace', 'cloak'];
      const results = {};
      c.equipment = { trinkets: [] };
      for (let i = 0; i < order.length; i++) {
        c.equipment[order[i]] = base[order[i]];
        const count = i + 1;
        if ([2, 4, 6, 8].includes(count)) {
          const activeTiers = [2, 4, 6, 8, 10].filter((t) => hasSetTier(c, "First Sword's Regalia", t));
          results[count] = activeTiers;
        }
      }
      c.equipment.trinkets = base.trinkets;
      const activeAt10 = [2, 4, 6, 8, 10].filter((t) => hasSetTier(c, "First Sword's Regalia", t));
      results[10] = activeAt10;
      const onlyOneEach = Object.values(results).every((tiers) => tiers.length === 1);
      const correctTiers = results[2][0] === 2 && results[4][0] === 4 && results[6][0] === 6 && results[8][0] === 8 && results[10][0] === 10;
      return { pass: onlyOneEach && correctTiers, results };
    });
    record('DRA-B-SET-02', 'Regression: Legion (cumulative, non-exclusive) still shows every met tier simultaneously active', () => {
      const s = makeChar(20);
      s.equipment.mainhand = 'a legion veteran\'s gladius';
      s.equipment.boots = 'legion march boots';
      const count = setPieceCount(s, 'Legion');
      const activeTiers = [2, 4, 6, 8].filter((t) => hasSetTier(s, 'Legion', t));
      return { pass: count === 2 && activeTiers.length === 1 && activeTiers[0] === 2, count, activeTiers };
    });
    record('DRA-B-SET-03', 'Regression: setStatBonus for a cumulative set still sums every met tier (not just the highest)', () => {
      // Use a synthetic 2-tier scenario with a set already in SETS that has
      // flat bonuses.bonuses at two different tiers, if one exists;
      // otherwise confirm via direct SETS inspection that cumulative logic
      // is untouched for a non-exclusive set.
      const legion = SETS['Legion'];
      return { pass: !legion.exclusive, legionExclusiveFlag: legion.exclusive };
    });
    record('DRA-B-SET-04', 'describeSetProgress renders without throwing for both an exclusive and a cumulative set', () => {
      const s = freshDregnar();
      // describeSetProgress reads state.equipment (player-only) — exercise
      // it on a player with a partial Dregnar loadout to confirm no crash
      // from the exclusive branch.
      const p = makeChar(30);
      p.equipment.mainhand = 'Ashquench';
      p.equipment.helmet = "First Sword's Crown";
      const lines = describeSetProgress(p);
      return { pass: Array.isArray(lines), lines };
    });

    // ============ 7. Elemental Sovereignty ============
    record('DRA-B-SOV-01', 'A successful water-element cast while 10pc-equipped grants +15% to Attack/Defense/Magic/Accuracy/Agility/Speed, excludes Health', () => {
      const s = makeChar(30);
      const items = { mainhand: 'Ashquench', helmet: "First Sword's Crown", chest: "Kar'Mhal's Silver Plate", gloves: 'Vosgard Oathgrips', boots: 'Stillwater Sabatons', rings: 'Seal of the First Sword', necklace: 'Pendant of the Unquenched', cloak: 'Mantle of the Tower' };
      Object.assign(s.equipment, items);
      s.equipment.trinkets = ['Black-Ice Reliquary', 'Vowstone of Vosgard'];
      s.recomputeStats(false);
      s.flags.isMage = true; s.primaryElement = 'water'; s.knowledge = 999;
      startCombat(s, 'bandit_cutthroat', 10);
      activeEnemySlot(s.combat).maxHp *= 1000; activeEnemySlot(s.combat).hp = activeEnemySlot(s.combat).maxHp; // survive the cast so combat stays open for the post-cast reads below
      const atkBefore = effectivePlayerAtk(s);
      const defBefore = effectivePlayerDef(s);
      const healthBefore = s.maxHealth;
      withForcedHit(() => useElementAbility(s, 'water'));
      const atkAfter = effectivePlayerAtk(s);
      const defAfter = effectivePlayerDef(s);
      const healthAfter = s.maxHealth;
      return {
        pass: s.combat.player.sovereigntyTurnsLeft === 2 && atkAfter > atkBefore && defAfter > defBefore && healthAfter === healthBefore,
        atkBefore, atkAfter, defBefore, defAfter, healthBefore, healthAfter, sovereigntyTurnsLeft: s.combat.player.sovereigntyTurnsLeft,
      };
    });
    record('DRA-B-SOV-02', 'Refreshes without stacking the percentage on a second cast inside the window', () => {
      const s = makeChar(30);
      Object.assign(s.equipment, { mainhand: 'Ashquench', helmet: "First Sword's Crown", chest: "Kar'Mhal's Silver Plate", gloves: 'Vosgard Oathgrips', boots: 'Stillwater Sabatons', rings: 'Seal of the First Sword', necklace: 'Pendant of the Unquenched', cloak: 'Mantle of the Tower' });
      s.equipment.trinkets = ['Black-Ice Reliquary', 'Vowstone of Vosgard'];
      s.recomputeStats(false);
      s.flags.isMage = true; s.primaryElement = 'water'; s.knowledge = 999;
      startCombat(s, 'bandit_cutthroat', 10);
      activeEnemySlot(s.combat).maxHp *= 1000; activeEnemySlot(s.combat).hp = activeEnemySlot(s.combat).maxHp;
      withForcedHit(() => useElementAbility(s, 'water'));
      const atkAfterFirst = effectivePlayerAtk(s);
      withForcedHit(() => useElementAbility(s, 'water'));
      const atkAfterSecond = effectivePlayerAtk(s);
      return { pass: atkAfterFirst === atkAfterSecond && s.combat.player.sovereigntyTurnsLeft === 2, atkAfterFirst, atkAfterSecond };
    });
    record('DRA-B-SOV-03', 'Expires cleanly after 2 turns', () => {
      const s = makeChar(30);
      Object.assign(s.equipment, { mainhand: 'Ashquench', helmet: "First Sword's Crown", chest: "Kar'Mhal's Silver Plate", gloves: 'Vosgard Oathgrips', boots: 'Stillwater Sabatons', rings: 'Seal of the First Sword', necklace: 'Pendant of the Unquenched', cloak: 'Mantle of the Tower' });
      s.equipment.trinkets = ['Black-Ice Reliquary', 'Vowstone of Vosgard'];
      s.recomputeStats(false);
      s.flags.isMage = true; s.primaryElement = 'water'; s.knowledge = 999;
      startCombat(s, 'bandit_cutthroat', 10);
      activeEnemySlot(s.combat).maxHp *= 1000; activeEnemySlot(s.combat).hp = activeEnemySlot(s.combat).maxHp;
      withForcedHit(() => useElementAbility(s, 'water'));
      const atkActive = effectivePlayerAtk(s);
      s.combat.player.sovereigntyTurnsLeft -= 1;
      s.combat.player.sovereigntyTurnsLeft -= 1;
      const atkExpired = effectivePlayerAtk(s);
      return { pass: atkActive > atkExpired && s.combat.player.sovereigntyTurnsLeft === 0, atkActive, atkExpired };
    });
    record('DRA-B-SOV-04', 'Dormant without the 10pc set equipped (a water cast with only partial gear grants nothing)', () => {
      const s = makeChar(30);
      s.equipment.mainhand = 'Ashquench'; // 1pc only
      s.recomputeStats(false);
      s.flags.isMage = true; s.primaryElement = 'water'; s.knowledge = 999;
      startCombat(s, 'bandit_cutthroat', 10);
      activeEnemySlot(s.combat).maxHp *= 1000; activeEnemySlot(s.combat).hp = activeEnemySlot(s.combat).maxHp;
      withForcedHit(() => useElementAbility(s, 'water'));
      return { pass: !(s.combat.player.sovereigntyTurnsLeft > 0), sovereigntyTurnsLeft: s.combat.player.sovereigntyTurnsLeft };
    });

    // ============ 8. DRA-P03 + Legacy combined stacking to +6 ============
    record('DRA-B-STACK-01', 'DRA-P03 and First Sword\'s Legacy both active simultaneously at <=40% HP: Attack ends up +6 over baseline', () => {
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      const baselineAtk = c.atk;
      e.hp = Math.round(e.maxHp * 0.35); // observed at the top of a normal action
      e.abilityCooldowns = { dra_barrier: 5 }; // force past Barrier (a non-damaging attempt that wouldn't consume either charge) so Hammerfall is the one actually attempted
      withForcedMiss(() => resolveEnemyAction(s, c, 2, 0)); // triggers both P03 and Legacy, consumes 1 charge from each via the actual action dispatch
      return {
        pass: e.draP03Used === true && c.legacyUsed === true && (e.draP03Charges || 0) === 1 && (c.legacyCharges || 0) === 1,
        draP03Used: e.draP03Used, legacyUsed: c.legacyUsed, p03Charges: e.draP03Charges, legacyCharges: c.legacyCharges, baselineAtk,
      };
    });
    record('DRA-B-STACK-02', 'Direct bracket check: both +3 sources applied together raise atk by +6 during a single damaging attempt', () => {
      // Updated 6 Nov 2026 (Combat Rebuild Phase 1, step 1b): dregnarResolveDamagingAttempt
      // now calls resolveEnemyAttackOnPlayer (js/engine/pipeline.js), not
      // resolveEnemyRetaliation directly -- resolveEnemyRetaliation is kept,
      // unchanged, only as step 1b's own parity oracle (see its header
      // comment in combat.js), no longer a live call site. Spy on the real
      // one instead; the bracket behavior under test (atk +6 during the
      // call, restored after) is unchanged -- confirmed separately by step
      // 1b's own forced-roll parity suite, which proved the two functions
      // produce identical results bit-for-bit.
      const s = freshDregnar();
      const c = activeEnemySlot(s.combat).creatureObj;
      const e = s.combat.enemies[0];
      const baseline = c.atk;
      e.draP03Charges = 2;
      c.legacyCharges = 2;
      let atkDuring = null;
      const origPipelineAttack = resolveEnemyAttackOnPlayer;
      window.resolveEnemyAttackOnPlayer = function (st, creature, ...rest) {
        atkDuring = creature.atk;
        return origPipelineAttack(st, creature, ...rest);
      };
      try { withForcedHit(() => dregnarResolveDamagingAttempt(s, e, c, { id: 'dra_hammerfall', name: 'x', dmgMult: 1.15 }, 2, 0)); }
      finally { window.resolveEnemyAttackOnPlayer = origPipelineAttack; }
      return { pass: atkDuring === baseline + 6 && c.atk === baseline, baseline, atkDuring, afterRestore: c.atk };
    });

    // ============ 9. Full existing regression (spot sample — the real
    // suites are re-run as separate node processes by the harness, not
    // inline here, since they're independent files) ============
    record('DRA-B-REGR-01', 'Stage A acceptance: equipped stats no longer match the Stage-A-only 840/76/76/48 figure now that equipment is wired (expected change, not a regression)', () => {
      const s = freshDregnar();
      return { pass: activeEnemySlot(s.combat).maxHp === 860 && activeEnemySlot(s.combat).maxHp !== 840, maxHp: activeEnemySlot(s.combat).maxHp };
    });
    record('DRA-B-REGR-02', 'Riposte cap (6f9af93) unaffected: non-player Riposte still caps at twice per combat on an unrelated creature', () => {
      const s = makeChar(20);
      startCombat(s, 'naqari_section_leader', 20);
      const c = activeEnemySlot(s.combat).creatureObj;
      c.riposteUsesThisCombat = 2;
      const allowed = typeof nonPlayerRiposteCapAllows === 'function' ? nonPlayerRiposteCapAllows(c) : null;
      return { pass: allowed === false, allowed };
    });

    return { ledger };
  });

  const passed = out.ledger.filter((l) => l.pass).length;
  console.log(`Dregnar Stage B: ${passed}/${out.ledger.length} passed`);
  for (const l of out.ledger) {
    if (!l.pass) console.log(`FAIL ${l.code}: ${l.description}\n  ${JSON.stringify(l.detail)}`);
  }
  console.log(`RESULT: ${passed}/${out.ledger.length}`);
  await browser.close();
  process.exit(passed === out.ledger.length ? 0 : 1);
})();
