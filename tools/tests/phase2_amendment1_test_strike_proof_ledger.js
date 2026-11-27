// Phase 2 Amendment 1 (18 Nov), test-strike proof: widening an existing
// registry entry's `holders` must actually reach the new holder, with
// ZERO engine code change -- the whole point of moving behavior into
// the registry instead of a hard-coded hasEffect()/hasModifier() check.
// Both widenings below are temporary, in-test mutations of the live
// MODIFIERS object (never committed data), reverted in a `finally`.
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

    function makeWarriorWithAlly() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      const ally = { defId: 'kessa', name: 'Kessa Vire', level: 25, health: 100, maxHealth: 100, def: 10, agility: 10, atk: 10, accuracy: 10, magic: 0, knowledge: 0, alive: true, statuses: {}, equipment: {} };
      s.party = [ally];
      return { s, ally };
    }

    // ---- Guardian Spirit, widened to ally ----
    // R1 (27 Nov) permanently widened effect:guardian_spirit's own
    // holders to include "ally" (it's one of the 9 kind-B mechanics R1
    // covers), so this proof no longer has a committed-default unwidened
    // example to start from. Both cases now explicitly set holders to
    // ["player"] / ["player","ally"] and restore the real value in a
    // `finally`, the same save/restore shape CALCULATEDAIM already used
    // below -- the proof's point (widening holders is a pure data change)
    // no longer depends on what today's shipped default happens to be.
    record('P2A1-TESTSTRIKE-GUARDIANSPIRIT-BEFORE', 'Baseline: an ally "wearing" Guardian Spirit still takes the hit normally when holders is forced back to ["player"] only, unwidened', () => {
      const { s, ally } = makeWarriorWithAlly();
      const creature = s.combat.enemies[0].creatureObj;
      const origHasEffect = window.hasEffect;
      const origConnects = window.attackConnects;
      const entry = MODIFIERS['effect:guardian_spirit'];
      const origHolders = entry.holders.slice();
      window.hasEffect = (obj, id) => id === 'guardian_spirit';
      window.attackConnects = () => true;
      entry.holders = ['player'];
      try {
        const result = resolveEnemyAttackOnAlly(s, creature, ally, null, null);
        const blocked = result.lines.some((l) => l.includes('Guardian Spirit'));
        return { pass: !blocked, lines: result.lines };
      } finally {
        entry.holders = origHolders;
        window.hasEffect = origHasEffect;
        window.attackConnects = origConnects;
      }
    });
    record('P2A1-TESTSTRIKE-GUARDIANSPIRIT-WIDENED', 'Widening MODIFIERS["effect:guardian_spirit"].holders to include "ally" -- a pure DATA change, zero engine code touched -- makes it actually block the ally\'s first hit, proving the dispatch (not just the presence check) reaches whoever holds it', () => {
      const { s, ally } = makeWarriorWithAlly();
      const creature = s.combat.enemies[0].creatureObj;
      const origHasEffect = window.hasEffect;
      const origConnects = window.attackConnects;
      const entry = MODIFIERS['effect:guardian_spirit'];
      const origHolders = entry.holders.slice();
      const origR1 = COMBAT_UNIFY.R1;
      window.hasEffect = (obj, id) => id === 'guardian_spirit';
      window.attackConnects = () => true;
      entry.holders = ['player', 'ally'];
      // Guardian Spirit's own `when` also requires COMBAT_UNIFY.R1 for a
      // non-player role (27 Nov) -- holders alone is structural, R1 is
      // the real on/off switch (same pattern Ashen Lungs already used),
      // so this proof has to flip both to demonstrate the real widening.
      COMBAT_UNIFY.R1 = true;
      try {
        const result = resolveEnemyAttackOnAlly(s, creature, ally, null, null);
        const used = ally.modifierState && ally.modifierState['effect:guardian_spirit'] && ally.modifierState['effect:guardian_spirit'].used;
        const blocked = result.lines.some((l) => l.includes('Guardian Spirit'));
        return { pass: blocked && used === true, used, lines: result.lines };
      } finally {
        entry.holders = origHolders;
        COMBAT_UNIFY.R1 = origR1;
        window.hasEffect = origHasEffect;
        window.attackConnects = origConnects;
      }
    });

    // ---- Calculated Aim, widened to player (the reverse direction: an
    // enemy-only accuracy effect, held by the PLAYER) ----
    function makeWarriorVsEnemy() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
      s.recomputeStats(false);
      startCombat(s, 'stoneback_beetle', 25);
      return s;
    }
    function rollPlayerVsEnemy(s, creature) {
      const actor = makePlayerCombatant(s);
      const target = findEnemyCombatant(s, creature);
      const action = { missLine: () => ['miss'] };
      return rollToHitPlayerActor(actor, target, action, { state: s });
    }
    record('P2A1-TESTSTRIKE-CALCULATEDAIM-BEFORE', 'Baseline: the player "wearing" Calculated Aim gets no accuracy bonus attacking an enemy -- holders is ["enemy"] only, unwidened', () => {
      const s = makeWarriorVsEnemy();
      const creature = s.combat.enemies[0].creatureObj;
      const origHasEffect = window.hasEffect;
      let capturedAcc = null;
      const origConnects = window.attackConnects;
      window.hasEffect = (obj, id) => id === 'sang_mil_ie003_calculated_aim';
      window.attackConnects = (acc) => { capturedAcc = acc; return true; };
      try {
        const baseAcc = effectivePlayerAccuracy(s);
        rollPlayerVsEnemy(s, creature);
        return { pass: capturedAcc === baseAcc, capturedAcc, baseAcc };
      } finally {
        window.hasEffect = origHasEffect;
        window.attackConnects = origConnects;
      }
    });
    record('P2A1-TESTSTRIKE-CALCULATEDAIM-WIDENED', 'Widening MODIFIERS["effect:sang_mil_ie003_calculated_aim"].holders to include "player" -- a pure DATA change -- makes rollToHitPlayerActor\'s own rollToHit.attacker dispatch actually add its +8, proving the reverse direction (an enemy-only effect, reaching the player) works through the SAME mechanism with zero engine change', () => {
      const s = makeWarriorVsEnemy();
      const creature = s.combat.enemies[0].creatureObj;
      const origHasEffect = window.hasEffect;
      let capturedAcc = null;
      const origConnects = window.attackConnects;
      const entry = MODIFIERS['effect:sang_mil_ie003_calculated_aim'];
      const origHolders = entry.holders.slice();
      window.hasEffect = (obj, id) => id === 'sang_mil_ie003_calculated_aim';
      window.attackConnects = (acc) => { capturedAcc = acc; return true; };
      entry.holders = origHolders.concat(['player']);
      try {
        const baseAcc = effectivePlayerAccuracy(s);
        rollPlayerVsEnemy(s, creature);
        return { pass: capturedAcc === baseAcc + 8, capturedAcc, baseAcc };
      } finally {
        entry.holders = origHolders;
        window.hasEffect = origHasEffect;
        window.attackConnects = origConnects;
      }
    });
    record('P2A1-TESTSTRIKE-CALCULATEDAIM-RESTORED', "Reverting the widening leaves Calculated Aim exactly as it was -- the mutation was fully contained to this test, not a lasting change to the registry", () => {
      const entry = MODIFIERS['effect:sang_mil_ie003_calculated_aim'];
      return { pass: JSON.stringify(entry.holders) === JSON.stringify(['enemy']), holders: entry.holders };
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
