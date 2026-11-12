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
    function makeState(level) {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = level || 20;
      s.recomputeStats(false);
      return s;
    }

    // ---- heal, out of combat, already full ----
    record('NOOP-HEAL-01', 'A heal potion at full health (out of combat) is NOT consumed, with a "would do nothing" message', () => {
      const s = makeState();
      s.health = s.maxHealth;
      s.inventory = ['a physician\'s tonic'];
      s.combat = null;
      const lines = useItem(s, "a physician's tonic");
      return { pass: s.inventory.includes("a physician's tonic") && /already at full health/.test(lines.join(' ')), lines, inventory: s.inventory };
    });

    // ---- heal, out of combat, actually missing health ----
    record('NOOP-HEAL-02', 'A heal potion when actually missing health IS consumed and heals', () => {
      const s = makeState();
      s.health = Math.max(1, s.maxHealth - 10);
      s.inventory = ["a physician's tonic"];
      s.combat = null;
      const before = s.health;
      const lines = useItem(s, "a physician's tonic");
      return { pass: !s.inventory.includes("a physician's tonic") && s.health > before, lines, before, after: s.health };
    });

    // ---- heal, IN combat, already full: item kept, but turn still spent (existing turn-economy behavior unchanged) ----
    record('NOOP-HEAL-03', 'A heal potion at full health used mid-combat is NOT consumed (turn economy is a separate, unchanged concern)', () => {
      const s = makeState();
      startCombat(s, 'stoneback_beetle', 20);
      s.health = s.maxHealth;
      s.inventory = ["a physician's tonic"];
      const lines = useItem(s, "a physician's tonic");
      return { pass: s.inventory.includes("a physician's tonic") && /already at full health/.test(lines.join(' ')), lines, inventory: s.inventory };
    });

    // ---- cleanse, nothing to clear ----
    record('NOOP-CLEANSE-01', 'A cleanse potion with nothing to clear mid-combat is NOT consumed', () => {
      const s = makeState();
      startCombat(s, 'stoneback_beetle', 20);
      s.combat.player.playerStatuses = {};
      s.inventory = ['a clearwater tonic'];
      const lines = useItem(s, 'a clearwater tonic');
      return { pass: s.inventory.includes('a clearwater tonic') && /nothing to clear/.test(lines.join(' ')), lines };
    });

    // ---- cleanse, something real to clear ----
    record('NOOP-CLEANSE-02', 'A cleanse potion WITH an active status mid-combat IS consumed and clears it', () => {
      const s = makeState();
      startCombat(s, 'stoneback_beetle', 20);
      s.combat.player.playerStatuses = { bleed: { name: 'Bleeding', dot: { pctMaxHp: 0.05 }, turnsLeft: 3 } };
      s.inventory = ['a clearwater tonic'];
      const lines = useItem(s, 'a clearwater tonic');
      return { pass: !s.inventory.includes('a clearwater tonic') && !s.combat.player.playerStatuses.bleed, lines };
    });

    // ---- cleanse used outside combat: previously would crash (state.combat.player.playerStatuses on null) ----
    record('NOOP-CLEANSE-03', 'A cleanse potion used OUTSIDE combat no longer crashes — refused, not consumed', () => {
      const s = makeState();
      s.combat = null;
      s.inventory = ['a clearwater tonic'];
      const lines = useItem(s, 'a clearwater tonic');
      return { pass: s.inventory.includes('a clearwater tonic') && /nothing to clear/.test(lines.join(' ')), lines };
    });

    // ---- field splint kit: unified "nothing a splint can help with" message for BOTH no-target sub-cases, never consumed on refusal ----
    record('NOOP-SPLINT-01', 'No severe injury at all: field splint kit refused with the unified message, NOT consumed', () => {
      const s = makeState();
      s.injuries = [];
      s.inventory = ['a field splint kit'];
      s.combat = null;
      const lines = useItem(s, 'a field splint kit');
      return { pass: s.inventory.includes('a field splint kit') && /nothing a splint can help with/.test(lines.join(' ')), lines };
    });

    record('NOOP-SPLINT-02', 'A severe injury already field-treated (re-upgraded): same unified refusal message, NOT consumed', () => {
      const s = makeState();
      s.injuries = [{ id: 'burns_burned_hands', group: 'burns', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: true }];
      s.inventory = ['a field splint kit'];
      s.combat = null;
      const lines = useItem(s, 'a field splint kit');
      return { pass: s.inventory.includes('a field splint kit') && /nothing a splint can help with/.test(lines.join(' ')) && s.injuries[0].severity === 'severe', lines, injuries: s.injuries };
    });

    record('NOOP-SPLINT-03', 'A real severe, untreated injury: field splint kit IS consumed and works', () => {
      const s = makeState();
      s.injuries = [{ id: 'burns_burned_hands', group: 'burns', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false }];
      s.inventory = ['a field splint kit'];
      s.combat = null;
      const lines = useItem(s, 'a field splint kit');
      return { pass: !s.inventory.includes('a field splint kit') && s.injuries[0].severity === 'minor' && s.injuries[0].fieldTreated === true, lines, injuries: s.injuries };
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
