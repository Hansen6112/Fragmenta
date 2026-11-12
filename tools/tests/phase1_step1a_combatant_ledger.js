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

    function makeState(level, cls) {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = cls || 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = level || 20;
      s.recomputeStats(false);
      return s;
    }
    function addAlly(s) {
      const allyId = Object.keys(ALLY_DEFS)[0];
      s.recruitAlly(allyId);
      return s.party[s.party.length - 1];
    }

    // ---- Wiring sanity: combatant factories read from the right live fields ----
    record('WIRE-01', 'makePlayerCombatant reflects live player identity/condition fields', () => {
      const s = makeState(25);
      const c = makePlayerCombatant(s);
      const nameOk = c.name === s.playerName && c.level === s.level;
      s.health = 0; s.playerDowned = true;
      const downedOk = c.alive === true && c.downed === true;
      s.playerDowned = false; s.health = 0;
      const deadOk = c.alive === false;
      return { pass: nameOk && downedOk && deadOk, nameOk, downedOk, deadOk };
    });

    record('WIRE-02', 'makeAllyCombatant reflects live ally identity/condition fields', () => {
      const s = makeState(25);
      const ally = addAlly(s);
      const c = makeAllyCombatant(ally);
      const nameOk = c.name === ally.name && c.id === ally.defId;
      ally.alive = false;
      const deadOk = c.alive === false;
      ally.alive = true;
      const aliveOk = c.alive === true;
      return { pass: nameOk && deadOk && aliveOk, nameOk, deadOk, aliveOk };
    });

    record('WIRE-03', 'makeEnemyCombatant reflects live enemy identity/condition fields', () => {
      const s = makeState(25);
      startCombat(s, 'stoneback_beetle', 20);
      const slot = s.combat.enemies[0];
      const c = makeEnemyCombatant(s, slot, 0);
      const nameOk = c.name === slot.name;
      slot.alive = false;
      const deadOk = c.alive === false;
      return { pass: nameOk && deadOk, nameOk, deadOk };
    });

    record('WIRE-04', 'partyCombatants returns player first, then every living+fallen party member in order', () => {
      const s = makeState(25);
      const a1 = addAlly(s);
      const list = partyCombatants(s);
      return { pass: list.length === 2 && list[0].kind === 'player' && list[1].kind === 'ally' && list[1].id === a1.defId, ids: list.map((c) => c.id) };
    });

    record('WIRE-05', 'enemyCombatants returns one view per state.combat.enemies slot, index-aligned', () => {
      const s = makeState(25);
      startCombat(s, 'stoneback_beetle', 20);
      const list = enemyCombatants(s);
      return { pass: list.length === s.combat.enemies.length && list[0].index === 0, len: list.length };
    });

    // ---- stat(): player branch parity against each existing effective* function, across forced buff/debuff states ----
    record('PARITY-PLAYER-01', 'stat(atk) === effectivePlayerAtk across a buffed state', () => {
      const s = makeState(25);
      startCombat(s, 'stoneback_beetle', 20);
      s.combat.player.atkBuffTurns = 3; s.combat.player.atkBuffAmount = 7;
      s.combat.player.everyChoiceAtkStacks = 2; s.combat.player.battleTemperedAtkStacks = 1;
      const c = makePlayerCombatant(s);
      return { pass: stat(s, c, 'atk') === effectivePlayerAtk(s), statVal: stat(s, c, 'atk'), direct: effectivePlayerAtk(s) };
    });
    record('PARITY-PLAYER-02', 'stat(def) === effectivePlayerDef across a debuffed state', () => {
      const s = makeState(25);
      startCombat(s, 'stoneback_beetle', 20);
      s.combat.player.playerStatuses = { shield_crush: { name: 'Shield Crush', debuff: { def: -5 }, turnsLeft: 2 } };
      s.combat.player.evasiveGuardBonus = 2;
      const c = makePlayerCombatant(s);
      return { pass: stat(s, c, 'def') === effectivePlayerDef(s), statVal: stat(s, c, 'def'), direct: effectivePlayerDef(s) };
    });
    record('PARITY-PLAYER-03', 'stat(agi) === effectivePlayerAgility across a percentage debuff', () => {
      const s = makeState(25);
      startCombat(s, 'stoneback_beetle', 20);
      s.combat.player.playerStatuses = { stagger: { name: 'Stagger', debuff: { agiPct: -0.2 }, turnsLeft: 2 } };
      const c = makePlayerCombatant(s);
      return { pass: stat(s, c, 'agi') === effectivePlayerAgility(s), statVal: stat(s, c, 'agi'), direct: effectivePlayerAgility(s) };
    });
    record('PARITY-PLAYER-04', 'stat(acc) === effectivePlayerAccuracy with a crafted-potion buff active', () => {
      const s = makeState(25);
      startCombat(s, 'stoneback_beetle', 20);
      s.combat.player.playerBuffs = { acc: { amount: 4, turns: 2 } };
      const c = makePlayerCombatant(s);
      return { pass: stat(s, c, 'acc') === effectivePlayerAccuracy(s), statVal: stat(s, c, 'acc'), direct: effectivePlayerAccuracy(s) };
    });
    record('PARITY-PLAYER-05', 'stat(spd) === effectivePlayerSpeedForInitiative with a flat status debuff', () => {
      const s = makeState(25);
      startCombat(s, 'stoneback_beetle', 20);
      s.combat.player.playerStatuses = { slowed: { name: 'Slowed', debuff: { spd: -3 }, turnsLeft: 2 } };
      const c = makePlayerCombatant(s);
      return { pass: stat(s, c, 'spd') === effectivePlayerSpeedForInitiative(s), statVal: stat(s, c, 'spd'), direct: effectivePlayerSpeedForInitiative(s) };
    });
    record('PARITY-PLAYER-06', 'stat(hp)/stat(maxHp) mirror state.health/state.maxHealth live, not a snapshot', () => {
      const s = makeState(25);
      const c = makePlayerCombatant(s);
      const before = stat(s, c, 'hp');
      s.health -= 10;
      const after = stat(s, c, 'hp');
      return { pass: after === before - 10 && stat(s, c, 'maxHp') === s.maxHealth, before, after };
    });
    // Step 1e handoff §3.2: effectivePlayerAtk's own Siege Corps charge
    // consumption made stat(player, "atk") impure the moment stat()'s
    // "atk" case started calling it directly in step 1a -- unnoticed
    // until now, since nothing had called stat(player, "atk") more than
    // once per hit, or for any reason other than resolving one. Fixed by
    // routing stat() through peekPlayerAtk (combat.js) instead;
    // effectivePlayerAtk itself is untouched, still consumed directly by
    // every not-yet-migrated player action.
    record('PARITY-PLAYER-07', 'stat(atk) peeks the Siege Corps one-shot charge without consuming it -- two reads see the same boosted value, and the charge survives both; effectivePlayerAtk (the legacy, still-consuming formula) produces the IDENTICAL number on its own first call, then actually spends it', () => {
      const s = makeState(25);
      startCombat(s, 'stoneback_beetle', 20);
      s.combat.player.siegeCorpsAtkCharge = 2;
      const c = makePlayerCombatant(s);
      const first = stat(s, c, 'atk');
      const second = stat(s, c, 'atk');
      const chargeSurvivedBothReads = s.combat.player.siegeCorpsAtkCharge === 2;
      const consumed = effectivePlayerAtk(s);
      const chargeGoneAfterConsume = s.combat.player.siegeCorpsAtkCharge === 0;
      return {
        pass: first === second && chargeSurvivedBothReads && consumed === first && chargeGoneAfterConsume,
        first, second, chargeSurvivedBothReads, consumed, chargeGoneAfterConsume,
      };
    });

    // ---- stat(): ally branch — only the already-centralized keys should work ----
    record('PARITY-ALLY-01', 'stat(spd) === effectiveAllySpeed for an ally, including a speed debuff', () => {
      const s = makeState(25);
      const ally = addAlly(s);
      ally.statuses = { pinned: { name: 'Pinned', debuff: { spd: -2 }, turnsLeft: 2 } };
      const c = makeAllyCombatant(ally);
      return { pass: stat(s, c, 'spd') === effectiveAllySpeed(ally), statVal: stat(s, c, 'spd'), direct: effectiveAllySpeed(ally) };
    });
    record('PARITY-ALLY-02', 'stat(hp)/stat(maxHp) mirror ally.health/ally.maxHealth live', () => {
      const s = makeState(25);
      const ally = addAlly(s);
      ally.health -= 5;
      const c = makeAllyCombatant(ally);
      return { pass: stat(s, c, 'hp') === ally.health && stat(s, c, 'maxHp') === ally.maxHealth };
    });
    // NOTYET-ALLY-ATK used to live here, asserting stat(atk) for an ally
    // threw "not centralized yet" -- superseded, step 1d: atk/acc are
    // now centralized (effectiveAllyAtk/effectiveAllyAcc, companion.js),
    // for the plain-ally formula only (see those functions' own header
    // on why a kit-bearing ally's atk/acc stay separate and inline,
    // never routed through stat()).
    record('PARITY-ALLY-03', 'stat(atk)/stat(acc) === effectiveAllyAtk/effectiveAllyAcc for a plain ally, including a crafted-potion buff and a status debuff', () => {
      const s = makeState(25);
      const ally = addAlly(s);
      ally.buffs = { atk: { amount: 3, turns: 2 } };
      ally.statuses = { weakened: { name: 'Weakened', debuff: { acc: -2 }, turnsLeft: 2 } };
      const c = makeAllyCombatant(ally);
      return {
        pass: stat(s, c, 'atk') === effectiveAllyAtk(ally) && stat(s, c, 'acc') === effectiveAllyAcc(ally),
        atkStatVal: stat(s, c, 'atk'), atkDirect: effectiveAllyAtk(ally),
        accStatVal: stat(s, c, 'acc'), accDirect: effectiveAllyAcc(ally),
      };
    });

    // ---- stat(): enemy branch ----
    record('PARITY-ENEMY-01', 'stat(atk) === effectiveEnemyAtk for an enemy, including a Disarm penalty', () => {
      const s = makeState(25);
      startCombat(s, 'stoneback_beetle', 20);
      activeEnemySlot(s.combat).enemyAtkPenalty = 2;
      const slot = s.combat.enemies[0];
      const c = makeEnemyCombatant(s, slot, 0);
      const creature = slot.creatureObj;
      return { pass: stat(s, c, 'atk') === effectiveEnemyAtk(s, creature), statVal: stat(s, c, 'atk'), direct: effectiveEnemyAtk(s, creature) };
    });
    record('PARITY-ENEMY-02', 'stat(hp)/stat(maxHp) mirror the enemy slot’s own hp/maxHp live', () => {
      const s = makeState(25);
      startCombat(s, 'stoneback_beetle', 20);
      const slot = s.combat.enemies[0];
      slot.hp -= 3;
      const c = makeEnemyCombatant(s, slot, 0);
      return { pass: stat(s, c, 'hp') === slot.hp && stat(s, c, 'maxHp') === slot.maxHp };
    });
    // NOTYET-ENEMY-DEF used to live here, asserting stat(def) for an
    // enemy threw "not centralized yet" -- superseded, step 1d: def is
    // now centralized, but as the PURE value only (creature.def, no
    // banked Brace/Guarded Strike/Sure Foundation bonus) -- the
    // stat()-purity rule means a banked bonus is summed in separately at
    // the pipeline's own call site (pipeline.js), never inside stat()
    // itself. This test proves BOTH: the pure value is right, AND a
    // live banked bonus is deliberately excluded from it.
    record('PARITY-ENEMY-03', 'stat(def) === creature.def exactly, excluding a live banked Brace bonus on purpose (stat()-purity rule)', () => {
      const s = makeState(25);
      startCombat(s, 'stoneback_beetle', 20);
      const slot = s.combat.enemies[0];
      slot.creatureObj.braceBonusDef = 3;
      const c = makeEnemyCombatant(s, slot, 0);
      return { pass: stat(s, c, 'def') === slot.creatureObj.def && stat(s, c, 'def') !== slot.creatureObj.def + 3, statVal: stat(s, c, 'def'), creatureDef: slot.creatureObj.def };
    });

    return ledger;
  });

  console.log(JSON.stringify(out, null, 2));
  const fails = out.filter((e) => !e.pass);
  console.error(`\n${out.length - fails.length}/${out.length} passed`);
  if (fails.length) {
    console.error('FAILURES:');
    for (const f of fails) console.error(`  ${f.code}: ${f.description}\n    detail: ${JSON.stringify(f.detail)}`);
  }
  console.log(`RESULT: ${out.length - fails.length}/${out.length}`);
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
