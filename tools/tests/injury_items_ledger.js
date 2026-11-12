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

    function makeApothecary(level) {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'apothecary';
      s.origin = Object.keys(ORIGINS)[0]; s.level = level || 20;
      s.recomputeStats(false);
      s.knowledge = 15; // above both placeholder reqs (8, 10)
      return s;
    }
    function makeWarrior(level) {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = level || 20;
      s.recomputeStats(false);
      return s;
    }
    function addAlly(s) {
      const allyId = Object.keys(ALLY_DEFS)[0];
      s.recruitAlly(allyId);
      return s.party[s.party.length - 1];
    }

    // ---- Retest: node tools/audit.js is covered separately (shell), not here ----

    record('CRAFT-01', 'An Apothecary at Knowledge 15 can craft "smelling salts" via cmdCraft', () => {
      const s = makeApothecary(20);
      s.inventory = ['a handful of scrap components', 'a vial of distilled ashroot'];
      s.gold = 0;
      const lines = cmdCraft('smelling salts', s);
      return { pass: s.inventory.includes('smelling salts'), lines, inventory: s.inventory };
    });

    record('CRAFT-02', 'An Apothecary at Knowledge 15 can craft "a field splint kit" via cmdCraft', () => {
      const s = makeApothecary(20);
      s.inventory = ['a handful of scrap components', 'a sprig of swamp nightroot'];
      const lines = cmdCraft('field splint kit', s);
      return { pass: s.inventory.includes('a field splint kit'), lines, inventory: s.inventory };
    });

    record('CRAFT-03', 'A non-Apothecary (Warrior) is refused when trying to craft smelling salts, even with materials and Knowledge', () => {
      const s = makeWarrior(20);
      s.knowledge = 15;
      s.inventory = ['a handful of scrap components', 'a vial of distilled ashroot'];
      const lines = cmdCraft('smelling salts', s);
      return { pass: !s.inventory.includes('smelling salts') && /Only an Apothecary/.test(lines.join(' ')), lines };
    });

    record('SHOP-01', '"smelling salts" is in ITEM_DEFS as source "shop" and eligibleShopItems includes it at a generic (no-region) location', () => {
      const def = getItemDef('smelling salts');
      const locId = Object.keys(LOCATIONS).find((id) => (LOCATIONS[id].services || []).includes('shop'));
      const list = eligibleShopItems(locId);
      return { pass: def.source === 'shop' && list.includes('smelling salts'), source: def.source, locId, inList: list.includes('smelling salts') };
    });

    record('SHOP-02', 'shopBuyPrice("smelling salts") is exactly 160 gold (tier 2 -> 20*2^3)', () => {
      const price = shopBuyPrice('smelling salts');
      return { pass: price === 160, price };
    });

    record('SHOP-03', 'A non-Apothecary (Warrior) can buy "smelling salts" from a shop for 160 gold — potions (consumables) are always in stock, never subject to the random gear roll', () => {
      const s = makeWarrior(20);
      s.gold = 200;
      const locId = Object.keys(LOCATIONS).find((id) => (LOCATIONS[id].services || []).includes('shop'));
      s.location = locId;
      const shop = getOrRefreshShop(s, locId);
      const index = shop.stock.indexOf('smelling salts');
      const result = buyShopItem(s, locId, index, 1);
      return {
        pass: result.ok && result.price === 160 && s.inventory.includes('smelling salts') && s.gold === 40,
        result, gold: s.gold, inventory: s.inventory, locId, stockIndex: index,
      };
    });

    record('SHOP-04', '"a field splint kit" never appears in eligibleShopItems at ANY location (stays recipe-only)', () => {
      const def = getItemDef('a field splint kit');
      let foundAnywhere = false;
      for (const locId of Object.keys(LOCATIONS)) {
        if (!(LOCATIONS[locId].services || []).includes('shop')) continue;
        if (eligibleShopItems(locId).includes('a field splint kit')) { foundAnywhere = true; break; }
      }
      return { pass: def.source === 'crafted' && !foundAnywhere, source: def.source, foundAnywhere };
    });

    // ---- Functional: rally in a party fight ----
    record('RALLY-01', 'Player goes down, first ally to act uses smelling salts, player gets up at 25% max HP, item consumed', () => {
      const s = makeWarrior(20);
      const ally = addAlly(s);
      s.playerDowned = true;
      s.health = 0;
      s.inventory = ['smelling salts'];
      s.combat = { downs: [] };
      const lines = resolveOneAllyAction(s, ally);
      return {
        pass: !s.playerDowned && s.health === Math.ceil(s.maxHealth * 0.25) && !s.inventory.includes('smelling salts'),
        health: s.health, maxHealth: s.maxHealth, lines,
      };
    });

    // ---- Functional: field splint kit outside combat ----
    record('SPLINT-01', 'Using a field splint kit outside combat on a severe injury turns it minor and marks fieldTreated', () => {
      const s = makeWarrior(20);
      s.injuries = [{ id: 'burns_burned_hands', group: 'burns', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false }];
      s.inventory = ['a field splint kit'];
      s.combat = null;
      const lines = useItem(s, 'a field splint kit');
      return { pass: s.injuries[0].severity === 'minor' && s.injuries[0].fieldTreated === true, lines, injuries: s.injuries };
    });

    record('SPLINT-02', 'A second field splint kit use on an already-field-treated injury (now severe again, e.g. re-upgraded by a later down) is refused — the injury is untouched, and (per the later no-op-no-consume change) the kit is NOT consumed on a refused attempt.', () => {
      const s = makeWarrior(20);
      s.injuries = [{ id: 'burns_burned_hands', group: 'burns', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: true }];
      s.inventory = ['a field splint kit'];
      s.combat = null;
      const lines = useItem(s, 'a field splint kit');
      return { pass: s.injuries[0].severity === 'severe' && s.injuries[0].fieldTreated === true && s.inventory.includes('a field splint kit') && /nothing a splint can help with/.test(lines.join(' ')), lines, injuries: s.injuries, inventoryAfter: s.inventory };
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
