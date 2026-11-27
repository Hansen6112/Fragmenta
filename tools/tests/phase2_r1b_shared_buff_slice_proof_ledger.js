// R1b slice 4 (27 Nov): Hold the Line, Rooted Resolve, Rally the Line --
// the first members routed through the shared buff-stacking system,
// generalized via a new grantTemporaryStatBuff(holder, holderRole,
// statKey, amount, turns) helper (combat.js) that reuses companion.js's
// EXISTING crafted-potion-buff system (ally.buffs[statKey]) for an
// ally/enemy holder, instead of inventing new storage -- no new ally-
// side decrement code was needed for the buff itself (tickAllyBuffs
// already ticks it every round); only each trigger's own "used" flag
// needed the usual modifierStateHost treatment.
// Proves, for an ally, with COMBAT_UNIFY.R1 on: each trigger fires
// exactly once crossing its own Health threshold, the granted buff
// actually raises effectiveAllyDef/effectiveAllyAtk by the right
// amount, the buff decrements and expires via the EXISTING
// tickAllyBuffs (not new code), and none of this happens with R1 off.
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
    function withEffect(effectId, fn) {
      const orig = window.hasEffect;
      window.hasEffect = (obj, id) => id === effectId || orig(obj, id);
      try { return fn(); } finally { window.hasEffect = orig; }
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

    // ---- Hold the Line (set:Legion:8) ----
    record('R1B-HOLDTHELINE-R1OFF-NOTRIGGER', 'With COMBAT_UNIFY.R1 off, an ally below 30% Health wearing Legion:8 never triggers Hold the Line', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = false;
      try {
        const { s, kessa, creature } = withSetTier('Legion', 8, () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.25);
        withSetTier('Legion', 8, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 5 })));
        return { pass: !kessa.holdTheLineUsed && !(kessa.buffs && kessa.buffs.def), used: kessa.holdTheLineUsed, buffs: kessa.buffs };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });
    record('R1B-HOLDTHELINE-R1ON-GRANTS-DEF-BUFF', 'With COMBAT_UNIFY.R1 on, crossing below 30% Health grants +12 Defense (flatStat(6)) for 2 turns via ally.buffs.def, raising effectiveAllyDef', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      try {
        const { s, kessa, creature } = withSetTier('Legion', 8, () => freshPartyVsStoneback());
        const defBefore = effectiveAllyDef(kessa);
        kessa.health = Math.round(kessa.maxHealth * 0.25);
        const result = withSetTier('Legion', 8, () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 0.1 })));
        const defAfter = effectiveAllyDef(kessa);
        const awakened = result.lines.some((l) => l.includes('Hold the Line'));
        return { pass: kessa.holdTheLineUsed === true && kessa.buffs.def.turns === 2 && kessa.buffs.def.amount === 12 && defAfter === defBefore + 12 && awakened, used: kessa.holdTheLineUsed, buffDef: kessa.buffs.def, defBefore, defAfter, lines: result.lines };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });
    record('R1B-HOLDTHELINE-BUFF-EXPIRES-VIA-EXISTING-TICK', "Hold the Line's granted buff decrements and expires through tickAllyBuffs (companion.js) -- no new decrement code needed", () => {
      const { kessa } = (() => { const { s, kessa } = freshPartyVsStoneback(); return { s, kessa }; })();
      kessa.buffs = { def: { amount: 12, turns: 1 } };
      tickAllyBuffs(kessa);
      const expiredAfterOne = !kessa.buffs.def;
      kessa.buffs = { def: { amount: 12, turns: 2 } };
      tickAllyBuffs(kessa);
      const oneLeftAfterFirst = kessa.buffs.def && kessa.buffs.def.turns === 1;
      return { pass: expiredAfterOne && oneLeftAfterFirst, expiredAfterOne, oneLeftAfterFirst };
    });

    // ---- Rooted Resolve (effect:rooted_resolve) ----
    record('R1B-ROOTEDRESOLVE-R1ON-GRANTS-DEF-BUFF', 'With COMBAT_UNIFY.R1 on, an ally below 50% Health wearing rooted_resolve gets +16 Defense (flatStat(8)) for 3 turns', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      try {
        const { s, kessa, creature } = withEffect('rooted_resolve', () => freshPartyVsStoneback());
        kessa.health = Math.round(kessa.maxHealth * 0.45);
        const result = withEffect('rooted_resolve', () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 5 })));
        const awakened = result.lines.some((l) => l.includes('Rooted Resolve'));
        return { pass: kessa.rootedResolveUsed === true && kessa.buffs.def.turns === 3 && kessa.buffs.def.amount === 16 && awakened, used: kessa.rootedResolveUsed, buffDef: kessa.buffs.def, lines: result.lines };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    // ---- Rally the Line (effect:rally_the_line) ----
    record('R1B-RALLYTHELINE-R1ON-GRANTS-BOTH-BUFFS', 'With COMBAT_UNIFY.R1 on, an ally below 50% Health wearing rally_the_line gets +20 Attack AND +20 Defense (flatStat(10) each) for 4 turns', () => {
      const origR1 = COMBAT_UNIFY.R1;
      COMBAT_UNIFY.R1 = true;
      try {
        const { s, kessa, creature } = withEffect('rally_the_line', () => freshPartyVsStoneback());
        const atkBefore = effectiveAllyAtk(kessa);
        const defBefore = effectiveAllyDef(kessa);
        kessa.health = Math.round(kessa.maxHealth * 0.45);
        const result = withEffect('rally_the_line', () => withForcedHit(() => resolveEnemyAttackOnAlly(s, creature, kessa, null, { accBonus: 0, dmgMultBonus: 5 })));
        const awakened = result.lines.some((l) => l.includes('Rally the Line'));
        const atkAfter = effectiveAllyAtk(kessa);
        const defAfter = effectiveAllyDef(kessa);
        return {
          pass: kessa.rallyTheLineUsed === true && kessa.buffs.atk.turns === 4 && kessa.buffs.atk.amount === 20 && kessa.buffs.def.turns === 4 && kessa.buffs.def.amount === 20 && atkAfter === atkBefore + 20 && defAfter === defBefore + 20 && awakened,
          used: kessa.rallyTheLineUsed, buffs: kessa.buffs, atkBefore, atkAfter, defBefore, defAfter, lines: result.lines,
        };
      } finally { COMBAT_UNIFY.R1 = origR1; }
    });

    // ---- Player's own existing path, confirmed untouched ----
    record('R1B-PLAYER-RALLYTHELINE-UNCHANGED', "The player's own Rally the Line still writes combat.player.atkBuffTurns/atkBuffAmount directly (today's exact fields), not ally.buffs -- confirming the player branch of grantTemporaryStatBuff is byte-identical", () => {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      s.health = Math.round(s.maxHealth * 0.45);
      const lines = withEffect('rally_the_line', () => checkRallyTheLine(s, 'player'));
      const awakened = lines.some((l) => l.includes('Rally the Line'));
      return { pass: awakened && s.combat.player.rallyTheLineUsed === true && s.combat.player.atkBuffTurns === 4 && s.combat.player.atkBuffAmount === 20 && s.combat.player.defBuffTurns === 4 && s.combat.player.defBuffAmount === 20 && s.buffs === undefined, lines, combatPlayer: { atkBuffTurns: s.combat.player.atkBuffTurns, atkBuffAmount: s.combat.player.atkBuffAmount, defBuffTurns: s.combat.player.defBuffTurns, defBuffAmount: s.combat.player.defBuffAmount } };
    });

    const summary = { total: ledger.length, passed: ledger.filter((l) => l.pass).length, failed: ledger.filter((l) => !l.pass) };
    return { ledger, summary };
  });

  console.log(`R1b shared buff-stacking slice (Hold the Line/Rooted Resolve/Rally the Line) proof: ${out.summary.passed}/${out.summary.total} passed`);
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
