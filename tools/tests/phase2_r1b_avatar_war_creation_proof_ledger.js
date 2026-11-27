// R1b slice 5 (27 Nov): Avatar of War and Avatar of Creation, the last
// two members the shared buff-stacking system (slice 4) was built to
// unblock. Both route their temporary Attack (and, for Creation, Magic)
// buff through the same grantTemporaryStatBuff(holder, holderRole,
// statKey, amount, turns) helper as Hold the Line/Rooted Resolve/Rally
// the Line -- no new storage or decrement code needed for the buff
// itself. Creation's Magic half is generalized for parity but stays
// inert for an ally (no effectiveAllyMagic reader exists); its PERMANENT
// per-hit growth (rollPlayerDamage) and both effects' own cooldown-
// recovery-speed reads stay player-only and untouched, same as Avatar of
// Freedom's identical cooldown case.
// Proves, for an ally, with COMBAT_UNIFY.R1 on: each trigger fires
// exactly once crossing below 25% Health, the granted buff(s) actually
// raise effectiveAllyAtk by the right amount, the buffs decrement and
// expire via the existing tickAllyBuffs, both stay silent with R1 off,
// and the player's own path is untouched.
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

    // ---- Avatar of War (set:Regalia of the Crimson Vanguard:6) ----
    record('R1B-AVATAROFWAR-R1OFF-NOTRIGGER', 'With COMBAT_UNIFY.R1 off, an ally below 25% Health wearing Crimson Vanguard:6 never triggers Avatar of War', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = false;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Crimson Vanguard', 6, () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.2);
        withSetTier('Regalia of the Crimson Vanguard', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.1 })));
        return { pass: !kessa.avatarOfWarUsed && !(kessa.buffs && kessa.buffs.atk), used: kessa.avatarOfWarUsed, buffs: kessa.buffs };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-AVATAROFWAR-R1ON-GRANTS-ATK-BUFF', 'With COMBAT_UNIFY.R1 on, crossing below 25% Health grants +50% Attack for 4 turns via ally.buffs.atk, raising effectiveAllyAtk', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Crimson Vanguard', 6, () => freshPartyVsStoneback());
        const atkBefore = effectiveAllyAtk(kessa);
        const expectedAmount = Math.round(kessa.atk * 0.5);
        kessa.health = Math.round(kessa.maxHealth * 0.2);
        const result = withSetTier('Regalia of the Crimson Vanguard', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.1 })));
        const atkAfter = effectiveAllyAtk(kessa);
        const awakened = result.lines.some((l) => l.includes('Avatar of War'));
        return { pass: kessa.avatarOfWarUsed === true && kessa.avatarOfWarTurns === 4 && kessa.buffs.atk.turns === 4 && kessa.buffs.atk.amount === expectedAmount && atkAfter === atkBefore + expectedAmount && awakened, used: kessa.avatarOfWarUsed, turns: kessa.avatarOfWarTurns, buffAtk: kessa.buffs.atk, atkBefore, atkAfter, expectedAmount, lines: result.lines };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-AVATAROFWAR-DECREMENTS-NEXT-ROUND', 'avatarOfWarTurns decrements by exactly 1 at the next beginTurn, same as the buff itself via tickAllyBuffs', () => {
      const { s, kessa } = freshPartyVsStoneback();
      kessa.avatarOfWarTurns = 4;
      kessa.buffs = { atk: { amount: 20, turns: 4 } };
      beginTurn(s);
      return { pass: kessa.avatarOfWarTurns === 3 && kessa.buffs.atk.turns === 3, turns: kessa.avatarOfWarTurns, buffAtk: kessa.buffs.atk };
    });

    // ---- Avatar of Creation (set:Regalia of the Eternal Forge:6) ----
    record('R1B-AVATAROFCREATION-R1OFF-NOTRIGGER', 'With COMBAT_UNIFY.R1 off, an ally below 25% Health wearing Eternal Forge:6 never triggers Avatar of Creation', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = false;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Eternal Forge', 6, () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.2);
        withSetTier('Regalia of the Eternal Forge', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.1 })));
        return { pass: !kessa.avatarOfCreationUsed && !(kessa.buffs && kessa.buffs.atk), used: kessa.avatarOfCreationUsed, buffs: kessa.buffs };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-AVATAROFCREATION-R1ON-GRANTS-ATK-AND-MAGIC-BUFFS', 'With COMBAT_UNIFY.R1 on, crossing below 25% Health grants +40% Attack AND +40% Magic for 4 turns via ally.buffs, raising effectiveAllyAtk (Magic half generalized but inert -- no effectiveAllyMagic reader exists)', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Eternal Forge', 6, () => freshPartyVsStoneback());
        const atkBefore = effectiveAllyAtk(kessa);
        const expectedAtk = Math.round(kessa.atk * 0.4);
        const expectedMagic = Math.round(kessa.magic * 0.4);
        kessa.health = Math.round(kessa.maxHealth * 0.2);
        const result = withSetTier('Regalia of the Eternal Forge', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.1 })));
        const atkAfter = effectiveAllyAtk(kessa);
        const awakened = result.lines.some((l) => l.includes('Avatar of Creation'));
        return {
          pass: kessa.avatarOfCreationUsed === true && kessa.avatarOfCreationTurns === 4 && kessa.buffs.atk.turns === 4 && kessa.buffs.atk.amount === expectedAtk && kessa.buffs.magic.turns === 4 && kessa.buffs.magic.amount === expectedMagic && atkAfter === atkBefore + expectedAtk && awakened,
          used: kessa.avatarOfCreationUsed, turns: kessa.avatarOfCreationTurns, buffs: kessa.buffs, atkBefore, atkAfter, expectedAtk, expectedMagic, lines: result.lines,
        };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-AVATAROFCREATION-DECREMENTS-NEXT-ROUND', 'avatarOfCreationTurns decrements by exactly 1 at the next beginTurn, same as both buffs via tickAllyBuffs', () => {
      const { s, kessa } = freshPartyVsStoneback();
      kessa.avatarOfCreationTurns = 4;
      kessa.buffs = { atk: { amount: 16, turns: 4 }, magic: { amount: 8, turns: 4 } };
      beginTurn(s);
      return { pass: kessa.avatarOfCreationTurns === 3 && kessa.buffs.atk.turns === 3 && kessa.buffs.magic.turns === 3, turns: kessa.avatarOfCreationTurns, buffs: kessa.buffs };
    });

    // ---- Player's own existing path, confirmed untouched ----
    record('R1B-PLAYER-AVATAROFWAR-UNCHANGED', "The player's own Avatar of War still writes combat.player.atkBuffTurns/atkBuffAmount directly (today's exact fields), not combat.player.buffs -- confirming the player branch of grantTemporaryStatBuff is byte-identical", () => {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      s.health = Math.round(s.maxHealth * 0.2);
      const expectedAmount = Math.round(s.atk * 0.5);
      const lines = withSetTier('Regalia of the Crimson Vanguard', 6, () => checkAvatarOfWar(s, 'player'));
      const awakened = lines.some((l) => l.includes('Avatar of War'));
      return { pass: awakened && s.combat.player.avatarOfWarUsed === true && s.combat.player.atkBuffTurns === 4 && s.combat.player.atkBuffAmount === expectedAmount && s.buffs === undefined, lines, combatPlayer: { atkBuffTurns: s.combat.player.atkBuffTurns, atkBuffAmount: s.combat.player.atkBuffAmount } };
    });

    record('R1B-PLAYER-AVATAROFCREATION-UNCHANGED', "The player's own Avatar of Creation still writes combat.player.atkBuffTurns/atkBuffAmount and magicBuffTurns/magicBuffAmount directly, not combat.player.buffs", () => {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      s.health = Math.round(s.maxHealth * 0.2);
      const expectedAtk = Math.round(s.atk * 0.4);
      const expectedMagic = Math.round(s.magic * 0.4);
      const lines = withSetTier('Regalia of the Eternal Forge', 6, () => checkAvatarOfCreation(s, 'player'));
      const awakened = lines.some((l) => l.includes('Avatar of Creation'));
      return { pass: awakened && s.combat.player.avatarOfCreationUsed === true && s.combat.player.atkBuffTurns === 4 && s.combat.player.atkBuffAmount === expectedAtk && s.combat.player.magicBuffTurns === 4 && s.combat.player.magicBuffAmount === expectedMagic && s.buffs === undefined, lines, combatPlayer: { atkBuffTurns: s.combat.player.atkBuffTurns, atkBuffAmount: s.combat.player.atkBuffAmount, magicBuffTurns: s.combat.player.magicBuffTurns, magicBuffAmount: s.combat.player.magicBuffAmount } };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`R1b Avatar of War / Avatar of Creation proof: ${out.summary.passed}/${out.summary.total} passed`);
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
