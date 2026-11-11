// Step 1g-ii §2b: the one shared healing primitive, applyHealing
// (combat.js), now used by all six in-combat heal paths that used to
// write hp/health directly: tickEnemyPassives's regenPerTurn and
// healPctIfMaxed triggers, resolveEnemyAction's healSelfPct branch,
// allySupportAction's ally-heals-ally branch, applyConsumableEffectToAlly's
// heal effect, and useHadrianActive's healPct branch (Unyielding
// Advance). No Legacy oracle exists for any of these (nothing was ever
// duplicated -- every caller, old and new, has always called the same
// shared function), so this pins each path's hand-computed expected
// value, same convention as phase1_step1f_iv_ticks_pipeline_parity.js.
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
      return s;
    }

    // ============ applyHealing itself, all three target kinds ============
    record('P1G-II-HEALING-PLAYER-01', 'applyHealing on a player combatant: clamps to maxHealth, returns the actual delta', () => {
      const s = makeWarrior();
      startCombat(s, 'stoneback_beetle', 25);
      s.health = s.maxHealth - 5;
      const actor = makePlayerCombatant(s);
      const healed = applyHealing(actor, 20, 'test', { state: s });
      return { pass: healed === 5 && s.health === s.maxHealth, healed, health: s.health, maxHealth: s.maxHealth };
    });
    record('P1G-II-HEALING-ALLY-01', 'applyHealing on an ally combatant: clamps to maxHealth, returns the actual delta', () => {
      const s = makeWarrior();
      const kessa = s.recruitAlly('kessa');
      kessa.health = kessa.maxHealth - 7;
      const actor = makeAllyCombatant(kessa);
      const healed = applyHealing(actor, 20, 'test', { state: s });
      return { pass: healed === 7 && kessa.health === kessa.maxHealth, healed, health: kessa.health, maxHealth: kessa.maxHealth };
    });
    record('P1G-II-HEALING-ENEMY-01', 'applyHealing on an enemy combatant: clamps to maxHp, returns the actual delta', () => {
      const s = makeWarrior();
      startCombat(s, 'stoneback_beetle', 25);
      const e = s.combat.enemies[0];
      e.hp = e.maxHp - 3;
      const healed = applyHealing(makeEnemyCombatant(s, e, 0), 20, 'test', { state: s });
      return { pass: healed === 3 && e.hp === e.maxHp, healed, hp: e.hp, maxHp: e.maxHp };
    });
    record('P1G-II-HEALING-NOOP-01', 'applyHealing with amount <= 0 is a no-op, returns 0', () => {
      const s = makeWarrior();
      startCombat(s, 'stoneback_beetle', 25);
      const e = s.combat.enemies[0];
      const before = e.hp;
      const healed = applyHealing(makeEnemyCombatant(s, e, 0), 0, 'test', { state: s });
      return { pass: healed === 0 && e.hp === before, healed, hp: e.hp, before };
    });

    // ============ tickEnemyPassives: regenPerTurn (Great Matriarch Bear's Ancient Resilience) ============
    record('P1G-II-TICK-REGEN-01', 'tickEnemyPassives: regenPerTurn heals exactly Math.round(maxHp * pct), clamped to maxHp', () => {
      const s = makeWarrior();
      startCombat(s, 'greatMatriarchBear', 25);
      const e = s.combat.enemies[0];
      const expectedHeal = Math.round(e.maxHp * 0.03); // ancient_resilience's own pct
      e.hp = e.maxHp - expectedHeal - 10;
      const before = e.hp;
      const lines = tickEnemyPassives(s, e);
      return {
        pass: e.hp === before + expectedHeal && lines.some((l) => l.includes(`recovers ${expectedHeal} health`)),
        before, after: e.hp, expectedHeal, lines,
      };
    });
    record('P1G-II-TICK-REGEN-CLAMP-01', 'tickEnemyPassives: regenPerTurn clamps to maxHp when the raw heal would overshoot', () => {
      const s = makeWarrior();
      startCombat(s, 'greatMatriarchBear', 25);
      const e = s.combat.enemies[0];
      e.hp = e.maxHp - 1; // less than the 3% heal would be
      const lines = tickEnemyPassives(s, e);
      return { pass: e.hp === e.maxHp && lines.some((l) => l.includes('recovers 1 health')), hp: e.hp, maxHp: e.maxHp, lines };
    });

    // ============ tickEnemyPassives: healPctIfMaxed (Dreadroot's Corrupted Grove, pack already full) ============
    record('P1G-II-TICK-HEALMAXED-01', "tickEnemyPassives: periodicSummon's healPctIfMaxed heals exactly Math.round(maxHp * healPctIfMaxed) when the summon cap is already reached", () => {
      const s = makeWarrior();
      startCombat(s, 'dreadroot', 25);
      const e = s.combat.enemies[0];
      // corrupted_grove: everyNTurns 3, maxActive 4, healPctIfMaxed 0.05, capKey "dreadroot_undead"
      e.passiveOnceFlags['corrupted_grove:turns'] = 2; // this tick makes it 3 -> fires
      for (let i = 0; i < 4; i++) {
        s.combat.enemies.push({ alive: true, summonSourceKey: 'dreadroot_undead', hp: 1, maxHp: 1, creatureObj: { name: 'decoy' } });
      }
      const expectedHeal = Math.round(e.maxHp * 0.05);
      e.hp = e.maxHp - expectedHeal - 10;
      const before = e.hp;
      const lines = tickEnemyPassives(s, e);
      return {
        pass: e.hp === before + expectedHeal && lines.some((l) => l.includes(`recovers ${expectedHeal} health, its grove already at full strength`)),
        before, after: e.hp, expectedHeal, lines,
      };
    });

    // ============ resolveEnemyAction: healSelfPct (Rune Sentinel's Arcane Barrier) ============
    record('P1G-II-ENEMYSELFHEAL-01', 'resolveEnemyAction: an active with healSelfPct heals exactly Math.round(maxHp * healSelfPct)', () => {
      const s = makeWarrior();
      startCombat(s, 'runeSentinel', 25);
      const e = s.combat.enemies[0];
      const c = s.combat.creatureObj;
      e.abilityCooldowns = { rune_pulse: 99 }; // force arcane_barrier as the only eligible active
      const expectedHeal = Math.round(e.maxHp * 0.25); // arcane_barrier's own healSelfPct
      e.hp = e.maxHp - expectedHeal - 10;
      const before = e.hp;
      resolveEnemyAction(s, c, 2, 0);
      return { pass: e.hp === before + expectedHeal, before, after: e.hp, expectedHeal };
    });

    // ============ allySupportAction: healing another ally (not the player) ============
    record('P1G-II-ALLYSUPPORT-01', "allySupportAction: Kessa in Support stance mends Hadrian (the party's lowest-health member) for exactly ceil(maxHealth * 0.15), clamped", () => {
      const s = makeWarrior();
      const kessa = s.recruitAlly('kessa');
      const hadrian = s.recruitAlly('hadrian');
      startCombat(s, 'stoneback_beetle', 25);
      s.health = s.maxHealth; // the player isn't the lowest-health candidate
      const expectedHeal = Math.ceil(hadrian.maxHealth * 0.15);
      hadrian.health = hadrian.maxHealth - expectedHeal - 20;
      const before = hadrian.health;
      const lines = allySupportAction(s, kessa);
      return {
        pass: hadrian.health === before + expectedHeal && lines.some((l) => l.includes(`mending ${expectedHeal} health`)),
        before, after: hadrian.health, expectedHeal, lines,
      };
    });
    record('P1G-II-ALLYSUPPORT-CLAMP-01', 'allySupportAction: the ally-heals-ally branch clamps to maxHealth when the raw heal would overshoot', () => {
      const s = makeWarrior();
      const kessa = s.recruitAlly('kessa');
      const hadrian = s.recruitAlly('hadrian');
      startCombat(s, 'stoneback_beetle', 25);
      s.health = s.maxHealth;
      hadrian.health = hadrian.maxHealth - 2;
      const lines = allySupportAction(s, kessa);
      return { pass: hadrian.health === hadrian.maxHealth && lines.some((l) => l.includes('mending 2 health')), health: hadrian.health, maxHealth: hadrian.maxHealth, lines };
    });

    // ============ applyConsumableEffectToAlly: heal-type consumable ============
    record('P1G-II-CONSUMABLE-01', "applyConsumableEffectToAlly: a heal-type consumable heals exactly ceil(maxHealth * pct), clamped", () => {
      const s = makeWarrior();
      const kessa = s.recruitAlly('kessa');
      const expectedHeal = Math.ceil(kessa.maxHealth * 0.25); // "a minor healing draught"
      kessa.health = kessa.maxHealth - expectedHeal - 15;
      const before = kessa.health;
      const lines = applyConsumableEffectToAlly('a minor healing draught', kessa, { type: 'heal', pct: 0.25 });
      return {
        pass: kessa.health === before + expectedHeal && lines.some((l) => l.includes(`mending ${expectedHeal} health`)),
        before, after: kessa.health, expectedHeal, lines,
      };
    });
    record('P1G-II-CONSUMABLE-CLAMP-01', 'applyConsumableEffectToAlly: a heal-type consumable clamps to maxHealth when the raw heal would overshoot', () => {
      const s = makeWarrior();
      const kessa = s.recruitAlly('kessa');
      kessa.health = kessa.maxHealth - 2;
      const lines = applyConsumableEffectToAlly('a phoenix-down elixir', kessa, { type: 'heal', pct: 1.0 });
      return { pass: kessa.health === kessa.maxHealth && lines.some((l) => l.includes('mending 2 health')), health: kessa.health, maxHealth: kessa.maxHealth, lines };
    });

    // ============ useHadrianActive: healPct (Unyielding Advance) ============
    record('P1G-II-HADRIANHEAL-01', 'useHadrianActive: Unyielding Advance heals Hadrian for exactly round(maxHealth * healPct), and the flavor line still reports the pre-clamp healAmount unchanged', () => {
      const s = makeWarrior();
      const hadrian = s.recruitAlly('hadrian');
      hadrian.level = 25;
      startCombat(s, 'stoneback_beetle', 25);
      const kit = ALLY_DEFS.hadrian.abilityKit;
      const ability = kit.actives.find((a) => a.id === 'unyielding_advance');
      const expectedHeal = Math.round(hadrian.maxHealth * ability.healPct);
      hadrian.health = hadrian.maxHealth - expectedHeal - 25;
      const before = hadrian.health;
      const lines = useHadrianActive(s, hadrian, kit, ability, s.combat.enemies.filter((e) => e.alive));
      return {
        pass: hadrian.health === before + expectedHeal && lines.some((l) => l.includes(`mending for ${expectedHeal} health`)),
        before, after: hadrian.health, expectedHeal, lines,
      };
    });
    record('P1G-II-HADRIANHEAL-CLAMP-01', "useHadrianActive: Unyielding Advance's heal clamps to maxHealth, and the flavor line STILL reports the pre-clamp healAmount (unchanged quirk, not corrected here)", () => {
      const s = makeWarrior();
      const hadrian = s.recruitAlly('hadrian');
      hadrian.level = 25;
      startCombat(s, 'stoneback_beetle', 25);
      const kit = ALLY_DEFS.hadrian.abilityKit;
      const ability = kit.actives.find((a) => a.id === 'unyielding_advance');
      const expectedHealAmount = Math.round(hadrian.maxHealth * ability.healPct);
      hadrian.health = hadrian.maxHealth - 2; // actual room is only 2, far less than healAmount
      const lines = useHadrianActive(s, hadrian, kit, ability, s.combat.enemies.filter((e) => e.alive));
      return {
        pass: hadrian.health === hadrian.maxHealth && lines.some((l) => l.includes(`mending for ${expectedHealAmount} health`)),
        health: hadrian.health, maxHealth: hadrian.maxHealth, expectedHealAmount, lines,
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
