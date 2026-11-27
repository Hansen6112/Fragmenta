// R1b slice 2 (27 Nov): the first uniform Avatar-of-X batch -- Devotion,
// Endurance, Renewal (all three: a below-25%-Health once-per-fight
// trigger granting an N-round incoming-damage-multiplier window) and
// Chaos (same trigger shape, but its own window gates an OUTGOING
// damage-variance roll instead). Proves, for an ALLY, with
// COMBAT_UNIFY.R1 on: the trigger fires exactly once when Health
// crosses below 25%, the window actually reduces/randomizes the next
// hit through calculateIncomingDamage/calculateOutgoingMultiplier, the
// window decrements at the next beginTurn, and none of this happens
// with R1 off (the committed default) -- the player's own existing
// behavior is untouched either way (not re-asserted here; covered by
// the regression suite's own byte-identical runs with R1 off).
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
        detail = { error: e.message, stack: (e.stack || '').split('\n').slice(0, 4).join(' / ') };
      }
      ledger.push({ code, description, pass: passed && errors === 0, errors, detail });
    }
    function withForcedHit(fn) {
      const oc = window.attackConnects;
      window.attackConnects = () => true;
      try { return fn(); } finally { window.attackConnects = oc; }
    }
    function withSetTier(setName, tier, fn) {
      const orig = window.hasSetTier;
      window.hasSetTier = (obj, sName, t) => (sName === setName && t === tier) || orig(obj, sName, t);
      try { return fn(); } finally { window.hasSetTier = orig; }
    }
    function freshPartyVsStoneback() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      const kessa = s.recruitAlly('kessa');
      s.party = [kessa];
      return { s, kessa, creature: s.combat.enemies[0].creatureObj };
    }

    const INCOMING_MEMBERS = [
      { setName: 'Regalia of the Eternal Heart', tier: 6, usedFlag: 'avatarOfDevotionUsed', turnsField: 'avatarOfDevotionTurns', mult: 0.65, label: 'Devotion' },
      { setName: 'Regalia of the Eternal Bastion', tier: 6, usedFlag: 'avatarOfEnduranceUsed', turnsField: 'avatarOfEnduranceTurns', mult: 0.5, label: 'Endurance' },
      { setName: 'Regalia of the Endless Tide', tier: 6, usedFlag: 'avatarOfRenewalUsed', turnsField: 'avatarOfRenewalTurns', mult: 0.7, label: 'Renewal' },
    ];

    for (const m of INCOMING_MEMBERS) {
      record(`R1B-AVATAR-${m.label.toUpperCase()}-R1OFF-NOTRIGGER`, `With COMBAT_UNIFY.R1 off (default), an ally below 25% Health wearing ${m.label}'s set never triggers the window`, () => {
        const origR1 = COMBAT_UNIFY.R1;
        COMBAT_UNIFY.R1 = false;
        try {
          const { s, kessa, creature } = withSetTier(m.setName, m.tier, () => freshPartyVsStoneback());
          kessa.health = Math.round(kessa.maxHealth * 0.3);
          withSetTier(m.setName, m.tier, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 5 })));
          return { pass: !kessa[m.usedFlag] && !(kessa[m.turnsField] > 0), used: kessa[m.usedFlag], turns: kessa[m.turnsField] };
        } finally { COMBAT_UNIFY.R1 = origR1; }
      });

      record(`R1B-AVATAR-${m.label.toUpperCase()}-R1ON-TRIGGERS`, `With COMBAT_UNIFY.R1 on, an ally crossing below 25% Health wearing ${m.label}'s set triggers the window exactly once`, () => {
        const origR1 = COMBAT_UNIFY.R1;
        COMBAT_UNIFY.R1 = true;
        try {
          const { s, kessa, creature } = withSetTier(m.setName, m.tier, () => freshPartyVsStoneback());
          kessa.health = Math.round(kessa.maxHealth * 0.3);
          const result = withSetTier(m.setName, m.tier, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 5 })));
          const awakened = result.lines.some((l) => l.includes('awakens'));
          return { pass: kessa[m.usedFlag] === true && kessa[m.turnsField] === 4 && awakened, used: kessa[m.usedFlag], turns: kessa[m.turnsField], lines: result.lines };
        } finally { COMBAT_UNIFY.R1 = origR1; }
      });

      record(`R1B-AVATAR-${m.label.toUpperCase()}-REDUCES-INCOMING`, `Once the window is granted (and COMBAT_UNIFY.R1 on), the ally's next incoming hit is reduced by exactly ${m.mult}x through calculateIncomingDamage`, () => {
        const origR1 = COMBAT_UNIFY.R1;
        COMBAT_UNIFY.R1 = true;
        try {
          const { s, kessa } = freshPartyVsStoneback();
          kessa[m.turnsField] = 4;
          const ctx = { state: s, holder: kessa, role: 'ally', edmg: 100 };
          const before = kessa[m.turnsField];
          const result = withSetTier(m.setName, m.tier, () => calculateIncomingDamage(kessa, 'ally', ctx));
          return { pass: result.edmg === Math.round(100 * m.mult) && before === 4, edmg: result.edmg, expected: Math.round(100 * m.mult) };
        } finally { COMBAT_UNIFY.R1 = origR1; }
      });

      record(`R1B-AVATAR-${m.label.toUpperCase()}-DECREMENTS-NEXT-ROUND`, `The window field decrements by exactly 1 at the next beginTurn, the ally-side equivalent of combat.player's own decrement`, () => {
        const { s, kessa } = freshPartyVsStoneback();
        kessa[m.turnsField] = 4;
        beginTurn(s);
        return { pass: kessa[m.turnsField] === 3, turns: kessa[m.turnsField] };
      });
    }

    // Avatar of Chaos: same trigger shape, but an OUTGOING variance roll
    // (0.75 + Math.random(), forced here to a fixed draw) instead of a
    // fixed incoming reduction.
    record('R1B-AVATAR-CHAOS-R1ON-TRIGGERS', 'With COMBAT_UNIFY.R1 on, an ally crossing below 25% Health wearing Laughing Gale:6 triggers Avatar of Chaos exactly once', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Laughing Gale', 6, () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.3);
        const result = withSetTier('Regalia of the Laughing Gale', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 5 })));
        const awakened = result.lines.some((l) => l.includes('awakens'));
        return { pass: kessa.avatarOfChaosUsed === true && kessa.avatarOfChaosTurns === 4 && awakened, used: kessa.avatarOfChaosUsed, turns: kessa.avatarOfChaosTurns, lines: result.lines };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });
    record('R1B-AVATAR-CHAOS-RANDOMIZES-OUTGOING', "Once the window is granted (and COMBAT_UNIFY.R1 on), the ally's own outgoing calculateOutgoingMultiplier includes Avatar of Chaos's 0.75-1.75x swing (forced to a fixed draw here)", () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      const { s, kessa } = freshPartyVsStoneback();
      kessa.avatarOfChaosTurns = 4;
      const origRandom = Math.random;
      Math.random = () => 0.4; // forces 0.75 + 0.4 = 1.15
      try {
        const result = withSetTier('Regalia of the Laughing Gale', 6, () => calculateOutgoingMultiplier(kessa, 'ally', { holder: kessa, role: 'ally', isSpell: false, creature: s.combat.enemies[0].creatureObj, defenderHp: 1, defenderMaxHp: 1 }));
        return { pass: result.byKey['set:Regalia of the Laughing Gale:6'] != null && Math.abs(result.byKey['set:Regalia of the Laughing Gale:6'] - 1.15) < 1e-9, byKey: result.byKey };
      } finally { Math.random = origRandom; COMBAT_UNIFY.R1 = origR1; }
    });
    record('R1B-AVATAR-CHAOS-DECREMENTS-NEXT-ROUND', 'avatarOfChaosTurns decrements by exactly 1 at the next beginTurn', () => {
      const { s, kessa } = freshPartyVsStoneback();
      kessa.avatarOfChaosTurns = 4;
      beginTurn(s);
      return { pass: kessa.avatarOfChaosTurns === 3, turns: kessa.avatarOfChaosTurns };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`R1b Avatar-cluster slice 1 (Devotion/Endurance/Renewal/Chaos) proof: ${out.summary.passed}/${out.summary.total} passed`);
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
