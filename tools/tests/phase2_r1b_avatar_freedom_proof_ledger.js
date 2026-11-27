// R1b slice 3 (27 Nov): Avatar of Freedom, generalized to ally. Unlike
// slice 1's four members (a single damage-multiplier reader each),
// Freedom has three real consuming sites -- this slice only generalizes
// the trigger and the independent 50% evasion roll (rollToHit's own
// ally branch, pipeline.js); faster-cooldown-recovery and the
// activation-restriction bypass stay player-only (confirmed moot for an
// ally: no ally action is cooldown-gated or Knowledge-restricted the
// way Tactics/Abilities are). Proves, for an ally, with COMBAT_UNIFY.R1
// on: the trigger fires exactly once crossing below 25% Health, the
// evasion roll actually converts a would-be hit into a miss (and stays
// silent on R1 off), and the window decrements at the next beginTurn.
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

    record('R1B-FREEDOM-R1OFF-NOTRIGGER', 'With COMBAT_UNIFY.R1 off (default), an ally below 25% Health wearing Endless Horizon:6 never triggers Avatar of Freedom', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = false;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Endless Horizon', 6, () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.3);
        withSetTier('Regalia of the Endless Horizon', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 5 })));
        return { pass: !kessa.avatarOfFreedomUsed && !(kessa.avatarOfFreedomTurns > 0), used: kessa.avatarOfFreedomUsed, turns: kessa.avatarOfFreedomTurns };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-FREEDOM-R1ON-TRIGGERS', 'With COMBAT_UNIFY.R1 on, an ally crossing below 25% Health wearing Endless Horizon:6 triggers Avatar of Freedom exactly once', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Endless Horizon', 6, () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.3);
        const result = withSetTier('Regalia of the Endless Horizon', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 5 })));
        const awakened = result.lines.some((l) => l.includes('awakens'));
        return { pass: kessa.avatarOfFreedomUsed === true && kessa.avatarOfFreedomTurns === 4 && awakened, used: kessa.avatarOfFreedomUsed, turns: kessa.avatarOfFreedomTurns, lines: result.lines };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-FREEDOM-R1OFF-EVASION-INERT', 'With COMBAT_UNIFY.R1 off, an ally already holding avatarOfFreedomTurns (forced directly) still gets hit normally -- the evasion roll site itself is gated, not just the trigger', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = false;
      const origRandom = Math.random;
      try {
        const { s, kessa, creature } = freshPartyVsStoneback();
        kessa.avatarOfFreedomTurns = 4;
        Math.random = () => 0.1; // would roll the 50% evasion success if the gate were open
        const result = withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.3 }));
        const evaded = result.lines.some((l) => l.includes('beyond its reach'));
        return { pass: !evaded, evaded, lines: result.lines };
      } finally { Math.random = origRandom; COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-FREEDOM-R1ON-EVADES', "With COMBAT_UNIFY.R1 on and avatarOfFreedomTurns active, the ally's independent 50% evasion roll (forced to succeed) converts the hit into a miss and dispatches onEvade", () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      const origRandom = Math.random;
      try {
        const { s, kessa, creature } = freshPartyVsStoneback();
        kessa.avatarOfFreedomTurns = 4;
        const healthBefore = kessa.health;
        Math.random = () => 0.1; // forces the 50% evasion roll to succeed
        const result = withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.3 }));
        const evaded = result.lines.some((l) => l.includes('beyond its reach'));
        return { pass: evaded && kessa.health === healthBefore && result.damage === 0, evaded, healthBefore, healthAfter: kessa.health, damage: result.damage, lines: result.lines };
      } finally { Math.random = origRandom; COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-FREEDOM-DECREMENTS-NEXT-ROUND', 'avatarOfFreedomTurns decrements by exactly 1 at the next beginTurn', () => {
      const { s, kessa } = freshPartyVsStoneback();
      kessa.avatarOfFreedomTurns = 4;
      beginTurn(s);
      return { pass: kessa.avatarOfFreedomTurns === 3, turns: kessa.avatarOfFreedomTurns };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`R1b Avatar of Freedom proof: ${out.summary.passed}/${out.summary.total} passed`);
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
