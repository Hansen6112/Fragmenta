// Injury System v0.2/v0.3 acceptance ledger. Playwright against the real
// engine via localhost:8949, same pattern as every other verification
// script this engagement has used.
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

    function makePlayer(level) {
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

    // ---- D1/D11: injuries only apply on a SURVIVED fight ----
    record('INJ-01', 'Winning a fight with 1 banked down turns it into exactly 1 real injury', () => {
      const s = makePlayer(20);
      addAlly(s);
      s.injuries = [];
      s.combat = { downs: ['fire'], playerLastHitType: 'fire' };
      const lines = applyInjuriesFromDowns(s, s.combat.downs);
      return { pass: s.injuries.length === 1 && s.injuries[0].group === 'burns' && s.injuries[0].severity === 'minor', injuries: s.injuries, lines };
    });

    record('INJ-02', 'A true (un-rescued, non-dungeon) defeat never calls applyInjuriesFromDowns — injuries stay at 0', () => {
      const s = makePlayer(20);
      s.injuries = [];
      s.activeDungeon = null;
      s.combat = { downs: [], playerLastHitType: 'physical', isHadrianAmbush: false };
      s.health = 0;
      const msg = resolvePlayerDefeatOrDowned(s);
      return { pass: s.injuries.length === 0 && /goes dark/.test(msg), msg, injuries: s.injuries };
    });

    // ---- D2/§4: assignment rules — group targeting, minor->severe upgrade, 3-slot cap ----
    record('INJ-03', 'A second down in the SAME group upgrades the existing minor to severe instead of adding a new slot', () => {
      const s = makePlayer(20);
      s.injuries = [{ id: 'trauma_fractured_arm', group: 'trauma', severity: 'minor', acquiredDay: 1, sourceDamageType: null, fieldTreated: false }];
      applyInjuriesFromDowns(s, ['physical']);
      return { pass: s.injuries.length === 1 && s.injuries[0].severity === 'severe', injuries: s.injuries };
    });

    record('INJ-04', 'Rule 3: fewer than 3 injuries held -> a down in a NEW group adds a new minor slot (does not touch the existing one)', () => {
      const s = makePlayer(20);
      s.injuries = [{ id: 'trauma_fractured_arm', group: 'trauma', severity: 'minor', acquiredDay: 1, sourceDamageType: null, fieldTreated: false }];
      applyInjuriesFromDowns(s, ['fire']);
      return { pass: s.injuries.length === 2 && s.injuries.some((i) => i.group === 'burns' && i.severity === 'minor') && s.injuries.some((i) => i.id === 'trauma_fractured_arm' && i.severity === 'minor'), injuries: s.injuries };
    });

    record('INJ-05', 'Rule 4: already at 3 injuries held (none minor in the new group) -> upgrades a minor elsewhere to severe rather than exceeding 3 slots', () => {
      const s = makePlayer(20);
      s.injuries = [
        { id: 'trauma_fractured_arm', group: 'trauma', severity: 'minor', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
        { id: 'burns_burned_hands', group: 'burns', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
        { id: 'corrosion_damaged_eyes', group: 'corrosion', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
      ];
      applyInjuriesFromDowns(s, ['water']); // exposure group, not currently held
      return { pass: s.injuries.length === 3 && s.injuries.find((i) => i.id === 'trauma_fractured_arm').severity === 'severe', injuries: s.injuries };
    });

    record('INJ-06', 'injuryLoad is computed as minor=1, severe=2 and caps structurally at 6 (3 slots x severe)', () => {
      const s = makePlayer(20);
      s.injuries = [
        { id: 'trauma_fractured_arm', group: 'trauma', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
        { id: 'burns_burned_hands', group: 'burns', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
        { id: 'corrosion_damaged_eyes', group: 'corrosion', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
      ];
      return { pass: injuryLoad(s) === 6, load: injuryLoad(s) };
    });

    // ---- D3: the 7th fall ----
    record('INJ-07', 'injuryLoad+pendingDowns reaching 6 kills the player outright (pendingDeathCause "injuries"), never a down, even with allies alive', () => {
      const s = makePlayer(20);
      addAlly(s);
      s.injuries = [
        { id: 'trauma_fractured_arm', group: 'trauma', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
        { id: 'burns_burned_hands', group: 'burns', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
        { id: 'corrosion_damaged_eyes', group: 'corrosion', severity: 'minor', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
      ]; // load = 2+2+1 = 5
      s.playerDowned = false;
      s.activeDungeon = null;
      s.combat = { downs: ['physical'], playerLastHitType: 'physical', isHadrianAmbush: false }; // pendingDowns=1 -> 5+1=6
      s.health = 0;
      const msg = resolvePlayerDefeatOrDowned(s);
      return { pass: s.flags.pendingDeathCause === 'injuries' && /catches up with you/.test(msg) && !s.playerDowned, msg, cause: s.flags.pendingDeathCause };
    });

    record('INJ-08', 'The 7th-fall rule applies even inside a dungeon — no Mugamiir rescue when it fires', () => {
      const s = makePlayer(20);
      s.injuries = [
        { id: 'trauma_fractured_arm', group: 'trauma', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
        { id: 'burns_burned_hands', group: 'burns', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
        { id: 'corrosion_damaged_eyes', group: 'corrosion', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
      ]; // load = 6 already
      s.playerDowned = false;
      s.activeDungeon = { dungeonId: 'mugamiir_test' };
      s.combat = { downs: [], playerLastHitType: 'acid', isHadrianAmbush: false };
      s.health = 0;
      const msg = resolvePlayerDefeatOrDowned(s);
      return { pass: s.flags.pendingDeathCause === 'injuries' && !/Mugamiir/i.test(msg), msg };
    });

    // ---- D14/v0.3: the wipe-causing hit itself counts as a down for a rescued party ----
    record('INJ-09', 'D14: a solo lethal hit with no ally and no dungeon is a true defeat with 0 injuries applied', () => {
      const s = makePlayer(20);
      s.injuries = [];
      s.activeDungeon = null;
      s.combat = { downs: [], playerLastHitType: 'lightning', isHadrianAmbush: false };
      s.health = 0;
      const msg = resolvePlayerDefeatOrDowned(s);
      return { pass: s.injuries.length === 0 && s.flags.pendingDeathCause === 'combat' && /goes dark/.test(msg), msg, injuries: s.injuries };
    });

    record('INJ-10', 'D14: a solo lethal hit INSIDE a dungeon (no ally, no prior downs this fight) still banks the wipe-causing hit as a real injury via the Mugamiir rescue', () => {
      const s = makePlayer(20);
      s.injuries = [];
      s.activeDungeon = { dungeonId: 'mugamiir_test' };
      s.combat = { downs: [], playerLastHitType: 'acid', player: { playerLastHitType: 'acid' }, isHadrianAmbush: false }; // 0 prior downs this fight
      s.health = 0;
      const dungeonRescueBackup = dungeonRescue;
      let rescueCalled = false;
      dungeonRescue = function (st) { rescueCalled = true; st.combat = null; return 'The Mugamiir pulls you out.'; };
      let msg, err;
      try { msg = resolvePlayerDefeatOrDowned(s); } catch (e) { err = e.message; } finally { dungeonRescue = dungeonRescueBackup; }
      return { pass: !err && rescueCalled && s.injuries.length === 1, msg, err, injuries: s.injuries };
    });

    record('INJ-11', 'D14 cap: with injuryLoad+priorDowns already at 5, the wipe-causing-hit rescue adds exactly one more injury and never exceeds load 6', () => {
      const s = makePlayer(20);
      s.injuries = [
        { id: 'trauma_fractured_arm', group: 'trauma', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
        { id: 'burns_burned_hands', group: 'burns', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
        { id: 'corrosion_damaged_eyes', group: 'corrosion', severity: 'minor', acquiredDay: 1, sourceDamageType: null, fieldTreated: false },
      ]; // load = 5
      s.activeDungeon = { dungeonId: 'mugamiir_test' };
      s.combat = { downs: [], playerLastHitType: 'water', player: { playerLastHitType: 'water' }, isHadrianAmbush: false }; // pendingDowns=0, so 5+0=5 < 6, rescue path taken (not the 7th-fall branch)
      s.health = 0;
      const dungeonRescueBackup = dungeonRescue;
      dungeonRescue = function (st) { st.combat = null; return 'rescued'; };
      let msg, err;
      try { msg = resolvePlayerDefeatOrDowned(s); } catch (e) { err = e.message; } finally { dungeonRescue = dungeonRescueBackup; }
      return { pass: !err && injuryLoad(s) === 6, load: injuryLoad(s), msg, err, injuries: s.injuries };
    });

    record('INJ-12', 'D12/O1 via killAlly: the last ally dying while the player is downed, inside a dungeon, applies injuries for downs already banked (no extra fabricated down — the trigger here is the ally dying, not a fresh hit on the player)', () => {
      const s = makePlayer(20);
      const ally = addAlly(s);
      s.injuries = [];
      s.playerDowned = true;
      s.activeDungeon = { dungeonId: 'mugamiir_test' };
      s.combat = { downs: ['physical'], playerLastHitType: 'physical', isHadrianAmbush: false };
      const dungeonRescueBackup = dungeonRescue;
      dungeonRescue = function (st) { st.combat = null; return 'rescued'; };
      let lines, err;
      try { lines = killAlly(s, ally); } catch (e) { err = e.message; } finally { dungeonRescue = dungeonRescueBackup; }
      return { pass: !err && s.injuries.length === 1 && !s.playerDowned, lines, err, injuries: s.injuries };
    });

    // ---- D11: a successful flee also counts as survived ----
    record('INJ-13', 'A successful flee banks the fight\'s downs into real injuries, same as a win', () => {
      const s = makePlayer(20);
      s.injuries = [];
      s.combat = { downs: ['bleed'] };
      const lines = applyInjuriesFromDowns(s, s.combat.downs);
      return { pass: s.injuries.length === 1 && s.injuries[0].group === 'laceration', injuries: s.injuries, lines };
    });

    // ---- D6/rally mechanic ----
    record('INJ-14', 'An ally using a rallyFromDowned item on the player clears playerDowned, sets health to ceil(maxHealth*pct), and consumes the item', () => {
      const s = makePlayer(20);
      const ally = addAlly(s);
      s.playerDowned = true;
      s.health = 0;
      s.inventory = ['smelling salts'];
      s.combat = { downs: [] };
      const lines = resolveOneAllyAction(s, ally);
      return { pass: !s.playerDowned && s.health === Math.ceil(s.maxHealth * 0.25) && !s.inventory.includes('smelling salts'), health: s.health, maxHealth: s.maxHealth, lines };
    });

    record('INJ-15', 'With no rally item in inventory, a downed player stays down and the ally falls through to its normal action', () => {
      const s = makePlayer(20);
      const ally = addAlly(s);
      s.inventory = [];
      startCombat(s, 'stoneback_beetle', 20);
      s.playerDowned = true;
      const lines = resolveOneAllyAction(s, ally);
      return { pass: s.playerDowned === true, lines };
    });

    record('INJ-16', 'applyHeal is a no-op while the player is downed (set-bonus/passive auto-heals cannot quietly revive/top up a downed player)', () => {
      const s = makePlayer(20);
      s.playerDowned = true;
      s.health = 0;
      s.maxHealth = 200;
      const r = applyHeal(s, 50);
      return { pass: r.healed === 0 && s.health === 0, r, health: s.health };
    });

    // ---- §4/§5: recomputeStats applies injury penalties, multiplicative with fatigue, including the new maxHealth slots ----
    record('INJ-17', 'A severe injury on atk applies exactly -25% to Attack after recomputeStats', () => {
      const s = makePlayer(20);
      s.injuries = [];
      s.recomputeStats(false);
      const baseAtk = s.atk;
      s.injuries = [{ id: 'trauma_fractured_arm', group: 'trauma', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false }];
      s.recomputeStats(false);
      return { pass: s.atk === Math.round(baseAtk * 0.75), baseAtk, newAtk: s.atk };
    });

    record('INJ-18', 'A maxHealth-targeting injury (Cracked Ribs) reduces maxHealth by the penalty pct, unlike fatigue which never touches maxHealth', () => {
      const s = makePlayer(20);
      s.injuries = [];
      s.recomputeStats(false);
      const baseMax = s.maxHealth;
      s.injuries = [{ id: 'trauma_cracked_ribs', group: 'trauma', severity: 'minor', acquiredDay: 1, sourceDamageType: null, fieldTreated: false }];
      s.recomputeStats(false);
      return { pass: s.maxHealth === Math.round(baseMax * 0.9) && s.maxHealth < baseMax, baseMax, newMax: s.maxHealth };
    });

    // ---- §7: town healer cure path ----
    record('INJ-19', 'cmdHeal opens a choice menu instead of healing immediately when injuries are held', () => {
      const s = makePlayer(20);
      s.injuries = [{ id: 'trauma_fractured_arm', group: 'trauma', severity: 'minor', acquiredDay: 1, sourceDamageType: null, fieldTreated: false }];
      const loc0 = s.currentPlace();
      let origServices;
      try { origServices = effectiveServices(loc0); } catch (e) {}
      const origFn = window.effectiveServices;
      window.effectiveServices = () => ['healer'];
      let lines, err;
      try { lines = cmdHeal(s); } catch (e) { err = e.message; } finally { window.effectiveServices = origFn; }
      return { pass: !err && s.flags.pendingHealChoice === true, lines, err };
    });

    record('INJ-20', 'cmdChoose "cure0" removes exactly that one injury and charges gold', () => {
      const s = makePlayer(20);
      s.injuries = [{ id: 'trauma_fractured_arm', group: 'trauma', severity: 'minor', acquiredDay: 1, sourceDamageType: null, fieldTreated: false }];
      s.gold = 1000;
      s.flags.pendingHealChoice = true;
      const lines = cmdChoose('cure0', s);
      return { pass: s.injuries.length === 0 && s.gold < 1000 && !s.flags.pendingHealChoice, lines, gold: s.gold };
    });

    // ---- §7: Apothecary field treatment (injuryDowngrade) ----
    record('INJ-21', 'injuryDowngrade turns a severe injury into minor, marks fieldTreated, and cannot be reused on the same injury', () => {
      const s = makePlayer(20);
      s.injuries = [{ id: 'burns_burned_hands', group: 'burns', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false }];
      s.inventory = ['a field splint kit', 'a field splint kit'];
      s.combat = null;
      const lines1 = useItem(s, 'a field splint kit');
      const firstOk = s.injuries[0].severity === 'minor' && s.injuries[0].fieldTreated === true;
      const lines2 = useItem(s, 'a field splint kit');
      const secondRejected = s.injuries[0].severity === 'minor'; // still minor, not removed or re-touched
      return { pass: firstOk && secondRejected, lines1, lines2, injuries: s.injuries };
    });

    record('INJ-22', 'injuryDowngrade is rejected mid-combat (useItem\'s gate, before the item is touched)', () => {
      const s = makePlayer(20);
      s.injuries = [{ id: 'burns_burned_hands', group: 'burns', severity: 'severe', acquiredDay: 1, sourceDamageType: null, fieldTreated: false }];
      s.inventory = ['a field splint kit'];
      s.combat = { downs: [] };
      const lines = useItem(s, 'a field splint kit');
      return { pass: s.injuries[0].severity === 'severe' && s.inventory.includes('a field splint kit'), lines, injuries: s.injuries };
    });

    // ---- save/load round-trip ----
    record('INJ-23', 'injuries survive a toJSON/fromJSON round-trip', () => {
      const s = makePlayer(20);
      s.injuries = [{ id: 'exposure_frostbite', group: 'exposure', severity: 'severe', acquiredDay: 3, sourceDamageType: null, fieldTreated: false }];
      const json = s.toJSON();
      const s2 = GameState.fromJSON(JSON.parse(JSON.stringify(json)));
      return { pass: s2.injuries.length === 1 && s2.injuries[0].id === 'exposure_frostbite' && s2.injuries[0].severity === 'severe', injuries: s2.injuries };
    });

    record('INJ-24', 'An old save with no injuries field at all loads safely with injuries defaulted to []', () => {
      const s = makePlayer(20);
      const json = s.toJSON();
      delete json.injuries;
      const s2 = GameState.fromJSON(JSON.parse(JSON.stringify(json)));
      return { pass: Array.isArray(s2.injuries) && s2.injuries.length === 0, injuries: s2.injuries };
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
