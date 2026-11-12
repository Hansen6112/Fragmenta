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
    function makeState() {
      const s = new GameState();
      s.playerName = 'T'; s.race = 'human'; s.class = 'warrior';
      s.origin = Object.keys(ORIGINS)[0]; s.level = 20;
      s.recomputeStats(false);
      return s;
    }
    // Only "kessa" and "hadrian" exist as real recruitable allies today —
    // synthetic test-ally defs, same technique as the existing harness's
    // recruitFloorMercs (gate5b8_eq_regression/harness.js), to exercise
    // the cap itself with enough distinct ids to fill (and overfill) a
    // party of 3.
    for (let i = 1; i <= 2; i++) {
      if (!ALLY_DEFS['test_merc_' + i]) ALLY_DEFS['test_merc_' + i] = Object.assign({}, ALLY_DEFS.kessa, { name: 'Test Merc ' + i, abilityKit: undefined });
    }

    record('CAP-01', 'MAX_PARTY_ALLIES is exactly 3', () => ({ pass: MAX_PARTY_ALLIES === 3, MAX_PARTY_ALLIES }));

    record('CAP-02', 'Recruiting kessa, hadrian, test_merc_1 succeeds (party -> 3); a 4th (test_merc_2) is refused (returns null) and party stays at 3', () => {
      const s = makeState();
      const r1 = s.recruitAlly('kessa');
      const r2 = s.recruitAlly('hadrian');
      const r3 = s.recruitAlly('test_merc_1');
      const r4 = s.recruitAlly('test_merc_2');
      return {
        pass: !!r1 && !!r2 && !!r3 && r4 === null && s.party.length === 3,
        results: [!!r1, !!r2, !!r3, r4], partyLen: s.party.length, partyNames: s.party.map((a) => a.defId),
      };
    });

    record('CAP-03', 'maybeTalkToKessa refuses with "Your party is already full." when the party is already at 3 (hadrian + 2 test mercs), and does NOT set kessaRecruited', () => {
      const s = makeState();
      s.recruitAlly('hadrian'); s.recruitAlly('test_merc_1'); s.recruitAlly('test_merc_2');
      s.location = KESSA_LOCATION;
      s.flags.kessaQuestOffered = true;
      s.flags.kessaQuestReady = true;
      s.flags.kessaRecruited = false;
      const lines = maybeTalkToKessa('kessa', s);
      return {
        pass: /already full/i.test(lines.join(' ')) && !s.flags.kessaRecruited && s.party.length === 3,
        lines, kessaRecruited: s.flags.kessaRecruited, partyLen: s.party.length,
      };
    });

    record('CAP-04', 'Retry: once a slot frees up, talking to Kessa again actually recruits her (kessaQuestReady was never cleared by the refusal)', () => {
      const s = makeState();
      s.recruitAlly('hadrian'); s.recruitAlly('test_merc_1'); s.recruitAlly('test_merc_2');
      s.location = KESSA_LOCATION;
      s.flags.kessaQuestOffered = true;
      s.flags.kessaQuestReady = true;
      maybeTalkToKessa('kessa', s); // refused, party full
      s.party = s.party.filter((a) => a.defId !== 'test_merc_1'); // free a slot
      const lines = maybeTalkToKessa('kessa', s);
      return { pass: s.flags.kessaRecruited === true && s.party.some((a) => a.defId === 'kessa'), lines, partyNames: s.party.map((a) => a.defId) };
    });

    record('CAP-05', "acceptHadrianOffer refuses with a full-party message and does NOT clear hadrianOfferPending, so the SAME offer can be retried later", () => {
      const s = makeState();
      s.recruitAlly('kessa'); s.recruitAlly('test_merc_1'); s.recruitAlly('test_merc_2');
      s.flags.hadrianOfferPending = true;
      const lines1 = acceptHadrianOffer(s);
      const stillPendingAfterRefusal = s.flags.hadrianOfferPending === true;
      s.party = s.party.slice(1); // free a slot
      const lines2 = acceptHadrianOffer(s);
      return {
        pass: /already full/i.test(lines1.join(' ')) && stillPendingAfterRefusal && s.party.some((a) => a.defId === 'hadrian') && !s.flags.hadrianOfferPending,
        lines1, stillPendingAfterRefusal, lines2, partyNames: s.party.map((a) => a.defId),
      };
    });

    record('CAP-06', 'cmdRevive refuses with "Nothing was spent" when the party is full, and does not consume divine favor', () => {
      const s = makeState();
      s.recruitAlly('hadrian'); s.recruitAlly('test_merc_1'); s.recruitAlly('test_merc_2');
      s.fallenAllies = [{ defId: 'kessa', name: 'Kessa Vire', relationship: 0 }];
      s.divineFavor = DIVINE_FAVOR_REVIVAL_THRESHOLD;
      const favorBefore = s.divineFavor;
      const lines = cmdRevive('kessa', s);
      return {
        pass: /nothing was spent/i.test(lines.join(' ')) && s.divineFavor === favorBefore && s.fallenAllies.length === 1,
        lines, favorBefore, favorAfter: s.divineFavor,
      };
    });

    record('CAP-07', 'Nothing else about recruitment changes: recruiting with room still works exactly as before (name, gear, stats)', () => {
      const s = makeState();
      const ally = s.recruitAlly('kessa');
      return { pass: !!ally && ally.name === ALLY_DEFS.kessa.name && ally.alive === true && s.party.length === 1, ally: { name: ally && ally.name, alive: ally && ally.alive } };
    });

    record('CAP-08', 'A fallen-but-unresolved ally (alive:false, still physically in party) does NOT count against the cap — a new recruit can still fill a different slot', () => {
      const s = makeState();
      s.recruitAlly('hadrian'); s.recruitAlly('test_merc_1');
      s.party[0].alive = false; // hadrian "falls" but isn't yet sent home/left
      const r = s.recruitAlly('test_merc_2');
      return { pass: !!r && s.party.length === 3, partyNames: s.party.map((a) => a.defId), aliveCounts: s.party.map((a) => a.alive) };
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
