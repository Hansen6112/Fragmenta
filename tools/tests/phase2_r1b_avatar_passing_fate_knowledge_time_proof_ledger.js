// R1b slice 6 (28 Nov): the last 4 "Avatar of X" members -- Passing,
// Fate, Knowledge, Time -- plus a loose end from slice 5 (Avatar of
// War's own onHitDealt lifesteal entry, which slice 5 left untouched).
// All four triggers generalize to (holder, holderRole) the same shallow
// way as slice 2's four members: most of each effect's real mechanic
// turns out to have NO ally analog at all (Fate's crit-doubling --
// critMultiplier is scoped to state.combat with no ally crit system to
// double; Fate's cheatDeath save -- cheatDeath is only ever dispatched
// for the player; Knowledge's matchup override -- already dead code
// behind the permanently-true DAMAGE_TYPES_V2 flag; Knowledge's free
// spell casts and Time's cooldown-cost-0/zeroing -- no ally action is
// cooldown-gated the way Tactics/Abilities are), so only Passing's
// lifesteal (already a real registry entry, always:avatar_of_passing_
// lifesteal) and Time's +25% damage window (set:Regalia of the Eternal
// Hour:6) have a real ally-side consumer to widen alongside the trigger.
// Proves, for an ally, with COMBAT_UNIFY.R1 on: each trigger fires
// exactly once crossing its own threshold and stays silent with R1 off;
// Passing's and (the now-fixed) War's lifesteal entries actually heal
// the holder on a hit; Knowledge's Magic buff lands via the shared
// ally.buffs system (inert in practice, no effectiveAllyMagic reader,
// but doesn't crash); Time's own window actually raises the ally's
// outgoing damage multiplier and does NOT attempt to touch
// combat.cooldowns (which doesn't exist on an ally); every Turns field
// decrements at the next beginTurn; and the player's own path is
// unchanged for all four.
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

    // ---- Avatar of Passing (set:Regalia of the Final Veil:6) ----
    record('R1B-PASSING-R1OFF-NOTRIGGER', 'With COMBAT_UNIFY.R1 off, an ally below 25% Health wearing Final Veil:6 never triggers Avatar of Passing', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = false;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Final Veil', 6, () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.2);
        withSetTier('Regalia of the Final Veil', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.1 })));
        return { pass: !kessa.avatarOfPassingUsed && !(kessa.avatarOfPassingTurns > 0), used: kessa.avatarOfPassingUsed, turns: kessa.avatarOfPassingTurns };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-PASSING-R1ON-TRIGGERS-AND-LIFESTEALS', 'With COMBAT_UNIFY.R1 on, crossing below 25% Health triggers Avatar of Passing, and the already-migrated always:avatar_of_passing_lifesteal entry then heals 30% of a hit dealt', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Final Veil', 6, () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.2);
        const result = withSetTier('Regalia of the Final Veil', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.1 })));
        const awakened = result.lines.some((l) => l.includes('Avatar of Passing'));
        const healthBeforeHit = kessa.health;
        kessa.health = Math.max(1, kessa.health - 5);
        const healthBeforeLifesteal = kessa.health;
        runReactionHook('applyAndReact.onHitDealt', kessa, 'ally', { state: s, holder: kessa, role: 'ally', edmg: 20 });
        const healed = kessa.health - healthBeforeLifesteal;
        return { pass: kessa.avatarOfPassingUsed === true && kessa.avatarOfPassingTurns === 4 && awakened && healed === 6, used: kessa.avatarOfPassingUsed, turns: kessa.avatarOfPassingTurns, healed, awakened, lines: result.lines };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-PASSING-DECREMENTS-NEXT-ROUND', 'avatarOfPassingTurns decrements by exactly 1 at the next beginTurn', () => {
      const { s, kessa } = freshPartyVsStoneback();
      kessa.avatarOfPassingTurns = 4;
      beginTurn(s);
      return { pass: kessa.avatarOfPassingTurns === 3, turns: kessa.avatarOfPassingTurns };
    });

    // ---- Avatar of War's lifesteal loose end (always:avatar_of_war_lifesteal) ----
    record('R1B-WARLIFESTEAL-R1OFF-INERT', 'With COMBAT_UNIFY.R1 off, an ally already holding avatarOfWarTurns (forced directly) gets no lifesteal heal from a hit dealt', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = false;
      try {
        const { s, kessa } = freshPartyVsStoneback();
        kessa.avatarOfWarTurns = 4;
        kessa.health = Math.max(1, kessa.health - 10);
        const before = kessa.health;
        runReactionHook('applyAndReact.onHitDealt', kessa, 'ally', { state: s, holder: kessa, role: 'ally', edmg: 20 });
        return { pass: kessa.health === before, before, after: kessa.health };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-WARLIFESTEAL-R1ON-HEALS', 'With COMBAT_UNIFY.R1 on, an ally holding avatarOfWarTurns heals 10% of a hit dealt via the already-migrated always:avatar_of_war_lifesteal entry', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      try {
        const { s, kessa } = freshPartyVsStoneback();
        kessa.avatarOfWarTurns = 4;
        kessa.health = Math.max(1, kessa.health - 10);
        const before = kessa.health;
        runReactionHook('applyAndReact.onHitDealt', kessa, 'ally', { state: s, holder: kessa, role: 'ally', edmg: 20 });
        return { pass: kessa.health - before === 2, before, after: kessa.health };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    // ---- Avatar of Fate (set:Regalia of the Woven Thread:6) ----
    record('R1B-FATE-R1OFF-NOTRIGGER', 'With COMBAT_UNIFY.R1 off, an ally below 25% Health wearing Woven Thread:6 never triggers Avatar of Fate', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = false;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Woven Thread', 6, () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.2);
        withSetTier('Regalia of the Woven Thread', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.1 })));
        return { pass: !kessa.avatarOfFateUsed && !(kessa.avatarOfFateTurns > 0), used: kessa.avatarOfFateUsed, turns: kessa.avatarOfFateTurns };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-FATE-R1ON-TRIGGERS', 'With COMBAT_UNIFY.R1 on, an ally crossing below 25% Health wearing Woven Thread:6 triggers Avatar of Fate exactly once (crit-doubling and the cheatDeath save stay player-only -- no ally crit system or cheatDeath dispatch exists)', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Woven Thread', 6, () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.2);
        const result = withSetTier('Regalia of the Woven Thread', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.1 })));
        const awakened = result.lines.some((l) => l.includes('Avatar of Fate'));
        return { pass: kessa.avatarOfFateUsed === true && kessa.avatarOfFateTurns === 4 && awakened, used: kessa.avatarOfFateUsed, turns: kessa.avatarOfFateTurns, lines: result.lines };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-FATE-DECREMENTS-NEXT-ROUND', 'avatarOfFateTurns decrements by exactly 1 at the next beginTurn', () => {
      const { s, kessa } = freshPartyVsStoneback();
      kessa.avatarOfFateTurns = 4;
      beginTurn(s);
      return { pass: kessa.avatarOfFateTurns === 3, turns: kessa.avatarOfFateTurns };
    });

    // ---- Avatar of Knowledge (set:Regalia of the Endless Archive:6) ----
    record('R1B-KNOWLEDGE-R1OFF-NOTRIGGER', 'With COMBAT_UNIFY.R1 off, an ally below 25% Health wearing Endless Archive:6 never triggers Avatar of Knowledge', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = false;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Endless Archive', 6, () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.2);
        withSetTier('Regalia of the Endless Archive', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.1 })));
        return { pass: !kessa.avatarOfKnowledgeUsed && !(kessa.buffs && kessa.buffs.magic), used: kessa.avatarOfKnowledgeUsed, buffs: kessa.buffs };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-KNOWLEDGE-R1ON-TRIGGERS-AND-GRANTS-MAGIC-BUFF', 'With COMBAT_UNIFY.R1 on, crossing below 25% Health grants +50% Magic for 4 turns via ally.buffs.magic (inert for an ally -- no effectiveAllyMagic reader -- but does not crash), and writes knowledgeBuffAmount to the holder for parity (also inert: Expanding Mind reads combat.player.knowledgeBuffAmount directly)', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Endless Archive', 6, () => freshPartyVsStoneback());
        const expectedMagic = Math.round(kessa.magic * 0.5);
        const expectedKnowledgeAmount = flatStat(25);
        kessa.health = Math.round(kessa.maxHealth * 0.2);
        const result = withSetTier('Regalia of the Endless Archive', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.1 })));
        const awakened = result.lines.some((l) => l.includes('Avatar of Knowledge'));
        return {
          pass: kessa.avatarOfKnowledgeUsed === true && kessa.avatarOfKnowledgeTurns === 4 && kessa.buffs.magic.turns === 4 && kessa.buffs.magic.amount === expectedMagic && kessa.knowledgeBuffAmount === expectedKnowledgeAmount && awakened,
          used: kessa.avatarOfKnowledgeUsed, turns: kessa.avatarOfKnowledgeTurns, buffMagic: kessa.buffs.magic, knowledgeBuffAmount: kessa.knowledgeBuffAmount, expectedMagic, lines: result.lines,
        };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-KNOWLEDGE-DECREMENTS-AND-RESETS-KNOWLEDGE-BUFF', 'avatarOfKnowledgeTurns decrements at beginTurn, the Magic buff ticks via the existing tickAllyBuffs, and knowledgeBuffAmount zeroes out the moment the window reaches 0 (mirrors the player branch exactly)', () => {
      const { s, kessa } = freshPartyVsStoneback();
      kessa.avatarOfKnowledgeTurns = 1;
      kessa.knowledgeBuffAmount = 25;
      kessa.buffs = { magic: { amount: 10, turns: 1 } };
      beginTurn(s);
      return { pass: kessa.avatarOfKnowledgeTurns === 0 && kessa.knowledgeBuffAmount === 0 && !kessa.buffs.magic, turns: kessa.avatarOfKnowledgeTurns, knowledgeBuffAmount: kessa.knowledgeBuffAmount, buffs: kessa.buffs };
    });

    // ---- Avatar of Time (set:Regalia of the Eternal Hour:6) ----
    record('R1B-TIME-R1OFF-NOTRIGGER', 'With COMBAT_UNIFY.R1 off, an ally below 25% Health wearing Eternal Hour:6 never triggers Avatar of Time', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = false;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Eternal Hour', 6, () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.2);
        withSetTier('Regalia of the Eternal Hour', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.1 })));
        return { pass: !kessa.avatarOfTimeUsed && !(kessa.avatarOfTimeTurns > 0), used: kessa.avatarOfTimeUsed, turns: kessa.avatarOfTimeTurns };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-TIME-R1ON-TRIGGERS-AND-BOOSTS-OUTGOING-DAMAGE', 'With COMBAT_UNIFY.R1 on, crossing below 25% Health triggers Avatar of Time for 3 rounds (not 4 -- its own stated duration), does NOT touch combat.cooldowns (an ally has none), and its +25% damage window (set:Regalia of the Eternal Hour:6) raises calculateOutgoingMultiplier for the ally', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      try {
        const { s, kessa, creature } = withSetTier('Regalia of the Eternal Hour', 6, () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.2);
        const result = withSetTier('Regalia of the Eternal Hour', 6, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.1 })));
        const awakened = result.lines.some((l) => l.includes('Avatar of Time'));
        const outgoing = withSetTier('Regalia of the Eternal Hour', 6, () => calculateOutgoingMultiplier(kessa, 'ally', { holder: kessa, role: 'ally', creature, defenderHp: creature.hp, defenderMaxHp: creature.maxHp, isSpell: false }));
        return {
          pass: kessa.avatarOfTimeUsed === true && kessa.avatarOfTimeTurns === 3 && awakened && kessa.combat === undefined && Math.abs(outgoing.total - 1.25) < 1e-9,
          used: kessa.avatarOfTimeUsed, turns: kessa.avatarOfTimeTurns, hasCombat: kessa.combat !== undefined, outgoingTotal: outgoing.total, lines: result.lines,
        };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    record('R1B-TIME-DECREMENTS-NEXT-ROUND', 'avatarOfTimeTurns decrements by exactly 1 at the next beginTurn', () => {
      const { s, kessa } = freshPartyVsStoneback();
      kessa.avatarOfTimeTurns = 3;
      beginTurn(s);
      return { pass: kessa.avatarOfTimeTurns === 2, turns: kessa.avatarOfTimeTurns };
    });

    // ---- Player's own existing paths, confirmed untouched ----
    record('R1B-PLAYER-PASSING-FATE-KNOWLEDGE-TIME-UNCHANGED', "The player's own checkAvatarOfPassing/Fate/Knowledge/Time still write combat.player.* fields directly (today's exact fields): Knowledge's Magic buff still via Math.max on combat.player.magicBuffTurns/Amount, Time still zeroes combat.cooldowns, neither writes to a bare .buffs object", () => {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      s.combat.cooldowns = { feint: 2, decoy: 1 };
      s.health = Math.round(s.maxHealth * 0.2);
      const expectedMagic = Math.round(s.magic * 0.5);
      const expectedKnowledgeAmount = flatStat(25);

      const passingLines = withSetTier('Regalia of the Final Veil', 6, () => checkAvatarOfPassing(s, 'player'));
      const fateLines = withSetTier('Regalia of the Woven Thread', 6, () => checkAvatarOfFate(s, 'player'));
      const knowledgeLines = withSetTier('Regalia of the Endless Archive', 6, () => checkAvatarOfKnowledge(s, 'player', s));
      const timeLines = withSetTier('Regalia of the Eternal Hour', 6, () => checkAvatarOfTime(s, 'player'));

      return {
        pass: passingLines.some((l) => l.includes('Avatar of Passing')) && s.combat.player.avatarOfPassingTurns === 4
          && fateLines.some((l) => l.includes('Avatar of Fate')) && s.combat.player.avatarOfFateTurns === 4
          && knowledgeLines.some((l) => l.includes('Avatar of Knowledge')) && s.combat.player.avatarOfKnowledgeTurns === 4
          && s.combat.player.magicBuffAmount === expectedMagic && s.combat.player.knowledgeBuffAmount === expectedKnowledgeAmount
          && timeLines.some((l) => l.includes('Avatar of Time')) && s.combat.player.avatarOfTimeTurns === 3
          && s.combat.cooldowns.feint === 0 && s.combat.cooldowns.decoy === 0
          && s.buffs === undefined,
        combatPlayer: {
          avatarOfPassingTurns: s.combat.player.avatarOfPassingTurns, avatarOfFateTurns: s.combat.player.avatarOfFateTurns,
          avatarOfKnowledgeTurns: s.combat.player.avatarOfKnowledgeTurns, magicBuffAmount: s.combat.player.magicBuffAmount,
          knowledgeBuffAmount: s.combat.player.knowledgeBuffAmount, avatarOfTimeTurns: s.combat.player.avatarOfTimeTurns, cooldowns: s.combat.cooldowns,
        },
      };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`R1b Avatar of Passing/Fate/Knowledge/Time (+ Avatar of War lifesteal fix) proof: ${out.summary.passed}/${out.summary.total} passed`);
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
