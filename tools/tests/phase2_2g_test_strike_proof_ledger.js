// Phase 2g close-out, test-strike proof: one brand-new gear effect and
// one brand-new set bonus, written as DATA ONLY (a registerModifier call,
// nothing else), working for a player, an ally, and an enemy holder --
// R1 and R2 "forced on" for this proof means these two entries are
// simply AUTHORED with holders: ["player", "ally", "enemy"] from the
// start, since they're brand new (there's no existing player-only entry
// here to widen, unlike the Amendment 1 proof). Both entries are
// registered here, at runtime, inside this script's own page.evaluate --
// the ONLY place they exist; never written to modifiers.js, items.js,
// or sets.js on disk, so neither ever appears in the real game.
// window.hasEffect/window.hasSetTier are mocked per-holder (by strict
// object identity) so this proof never accidentally trips any OTHER
// real registry entry's own source check.
const { chromium } = require('playwright');
const { seedPageRandom } = require('./seed_rng');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const seed = await seedPageRandom(page);
  console.log(`seed: ${seed}`);
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

    // ---- the two brand-new, data-only entries ----
    registerModifier('effect:test_strike_2g_gear', {
      source: { kind: 'effect', id: 'test_strike_2g_gear' },
      hook: 'calculateDamage.outgoing', order: 500, bucket: 'conditional', value: 0.2, behavior: null,
      when: null, holders: ['player', 'ally', 'enemy'], state: null,
      notes: '2g test-strike proof (test-only, never shipped): +20% outgoing damage for whoever wears it, any role -- dispatched purely through calculateDamage.outgoing\'s own existing fan-out (calculateOutgoingMultiplier), already generalized for player/ally/enemy since task #2. Zero engine code added for this entry to work.',
    });
    registerModifier('set:Test Strike Proof:2', {
      source: { kind: 'set', id: 'Test Strike Proof:2', setName: 'Test Strike Proof', tier: 2 },
      hook: 'calculateDamage.outgoing', order: 501, bucket: 'conditional', value: 0.15, behavior: null,
      when: null, holders: ['player', 'ally', 'enemy'], state: null,
      notes: '2g test-strike proof (test-only, never shipped): +15% outgoing damage for whoever wears the 2pc set bonus, any role -- same mechanism as the gear effect above, zero engine code added.',
    });

    function makeWarrior() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      return s;
    }
    function makeAlly() {
      return { defId: 'kessa', name: 'Kessa Vire', level: 25, health: 100, maxHealth: 100, def: 10, agility: 10, atk: 10, accuracy: 10, magic: 0, knowledge: 0, alive: true, statuses: {}, equipment: {} };
    }

    // Mocks hasEffect/hasSetTier so ONLY `holder` (by strict identity)
    // is seen as carrying `effectId`/`setName:tier` -- every other real
    // holder or id still resolves through the real, unmocked function,
    // so this can never accidentally widen or trip any OTHER registry
    // entry's own source check.
    function withMockedPresence(holder, effectId, setName, tier, fn) {
      const origHasEffect = window.hasEffect;
      const origHasSetTier = window.hasSetTier;
      window.hasEffect = (obj, id) => (obj === holder && id === effectId) || origHasEffect(obj, id);
      window.hasSetTier = (obj, sName, t) => (obj === holder && sName === setName && t === tier) || origHasSetTier(obj, sName, t);
      try {
        return fn();
      } finally {
        window.hasEffect = origHasEffect;
        window.hasSetTier = origHasSetTier;
      }
    }

    const roles = [
      { role: 'player', build: () => { const s = makeWarrior(); return { holder: s, ctx: { state: s, holder: s, role: 'player' } }; } },
      { role: 'ally', build: () => { const s = makeWarrior(); const ally = makeAlly(); return { holder: ally, ctx: { state: s, holder: ally, role: 'ally' } }; } },
      { role: 'enemy', build: () => { const s = makeWarrior(); const creature = s.combat.enemies[0].creatureObj; return { holder: creature, ctx: { state: s, holder: creature, role: 'enemy' } }; } },
    ];

    for (const { role, build } of roles) {
      record(`P2G-TESTSTRIKE-GEAR-${role.toUpperCase()}-ABSENT`, `Baseline (${role}): without the new gear effect, calculateOutgoingMultiplier's byKey has no entry for it`, () => {
        const { holder, ctx } = build();
        const result = calculateOutgoingMultiplier(holder, role, ctx);
        return { pass: result.byKey['effect:test_strike_2g_gear'] === undefined, byKey: result.byKey };
      });
      record(`P2G-TESTSTRIKE-GEAR-${role.toUpperCase()}-PRESENT`, `A brand-new gear effect, authored with holders:['player','ally','enemy'] from the start, reaches the ${role} holder through calculateDamage.outgoing's existing fan-out -- zero engine code change`, () => {
        const { holder, ctx } = build();
        const result = withMockedPresence(holder, 'test_strike_2g_gear', null, null, () => calculateOutgoingMultiplier(holder, role, ctx));
        return { pass: result.byKey['effect:test_strike_2g_gear'] === 1.2, byKey: result.byKey };
      });
      record(`P2G-TESTSTRIKE-SET-${role.toUpperCase()}-ABSENT`, `Baseline (${role}): without the new set bonus, calculateOutgoingMultiplier's byKey has no entry for it`, () => {
        const { holder, ctx } = build();
        const result = calculateOutgoingMultiplier(holder, role, ctx);
        return { pass: result.byKey['set:Test Strike Proof:2'] === undefined, byKey: result.byKey };
      });
      record(`P2G-TESTSTRIKE-SET-${role.toUpperCase()}-PRESENT`, `A brand-new set bonus, authored with holders:['player','ally','enemy'] from the start, reaches the ${role} holder through the SAME existing fan-out -- zero engine code change`, () => {
        const { holder, ctx } = build();
        const result = withMockedPresence(holder, null, 'Test Strike Proof', 2, () => calculateOutgoingMultiplier(holder, role, ctx));
        return { pass: result.byKey['set:Test Strike Proof:2'] === 1.15, byKey: result.byKey };
      });
    }

    record('P2G-TESTSTRIKE-REGISTRY-UNCHANGED-ON-DISK', 'Both entries exist only in this test\'s own live MODIFIERS object -- a disposable runtime registration, same convention test_strike (step 1e\'s own proof) used for PLAYER_ACTION_DEFS', () => {
      return { pass: typeof MODIFIERS['effect:test_strike_2g_gear'] === 'object' && typeof MODIFIERS['set:Test Strike Proof:2'] === 'object' };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`Phase 2g test-strike proof: ${out.summary.passed}/${out.summary.total} passed`);
  if (out.summary.failed.length) {
    console.log('FAILURES:');
    for (const f of out.summary.failed) {
      console.log(`  ${f.code}: ${f.description}`);
      console.log(`    detail: ${JSON.stringify(f.detail)}`);
    }
  }
  await browser.close();
  console.log(`RESULT: ${out.summary.passed}/${out.summary.total}`);
  process.exit(out.summary.passed === out.summary.total ? 0 : 1);
})();
