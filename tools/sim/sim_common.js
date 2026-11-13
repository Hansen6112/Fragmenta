/*
 * FRAGMENTA -- shared sandbox + sim plumbing for the Damage Types Step 4
 * Layer 2 harnesses (boss_sweep.js, plus3_run.js).
 *
 * NEITHER of those two files exists anywhere in git history or in any
 * prior session's surviving output -- confirmed by a full `git log --all`
 * grep and a filesystem search before writing this. The project's own
 * docs (tools/combat_unify_switch_rollout.md: "Lives in the scratchpad's
 * ... directory ... not git-tracked, same as post_phase0_baseline...
 * itself never was") establish that this was always a scratch-only
 * convention, not an oversight -- so this is a RECONSTRUCTION from the
 * methodology those same docs describe (tools/phase1_acceptance.md,
 * tools/combat_unify_switch_rollout.md, tools/combat_1e_completion_gapfix_tables.md,
 * tools/groundbreaker_accuracy_fix_before_after.md), done with Tyler's
 * sign-off (session decision: "rebuild from the docs"), not a claim that
 * this is byte-for-byte the original. Reconstruction judgment calls are
 * flagged inline and summarized in the Step 4 report.
 *
 * Player turn policy: every round calls the real `playerAttack(state)` --
 * the same single-call-per-round convention tools/combatsim.js's own
 * `--party` mode already uses, and it already covers every class: a
 * Mage/Bruise's basic attack auto-picks one of their known elements
 * (actions.js's own `picksElement` comment), so "today's harnesses have
 * no non-physical damage" (the Step 4 handoff's own framing) reads as
 * "no ENEMY in the current roster deals non-physical damage" (consistent
 * with the rollout doc's own U1-measured-zero explanation: Dregnar has no
 * `element` field), not "Mages never cast." No tactic/active-ability AI
 * is reconstructed on top of that -- none of the Part B rows' own "what
 * it tests" column needs one; they all exercise enemy-side damage types/
 * resists/variants, which fire automatically off playerAttack's own call
 * chain (beginTurn + resolveRemainingInitiativeActions already drives
 * every ally's and enemy's turn inside that one call).
 *
 * Ally/enemy AI is the real engine's own code (companion.js's
 * resolveCompanionAction, combat.js's resolveEnemyActiveAbility) -- not
 * reconstructed at all, since it's already live and unaffected by this
 * harness being new.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = "/home/user/Fragmenta";

function buildSandbox(switchOn) {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  function el() {
    return {
      style: {}, dataset: {}, children: [], hidden: true, value: "", textContent: "", innerHTML: "",
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      appendChild(c) { return c; }, append() {}, prepend() {}, remove() {}, addEventListener() {}, setAttribute() {},
      getAttribute() { return null; }, querySelector() { return el(); }, querySelectorAll() { return []; }, focus() {},
      scrollIntoView() {}, replaceChildren() {}, closest() { return null; },
    };
  }
  const store = {};
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, Math, JSON, Date, setTimeout: () => 0, clearTimeout() {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: { getElementById: () => el(), createElement: () => el(), querySelector: () => el(), querySelectorAll: () => [], addEventListener() {}, body: el() },
    addEventListener() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  // Direction-agnostic: the real committed switch is permanently true as
  // of Part C (09d4131), so "off" now means patching true->false, not the
  // other way around. Detects whichever literal is actually committed and
  // replaces it with whichever this call wants, rather than assuming which
  // way the default runs (the same fix the 4 VM-sandbox ledgers needed).
  const SWITCH_LINE_RE = /const DAMAGE_TYPES_V2 = (true|false);/;
  for (const s of scripts) {
    let src = fs.readFileSync(path.join(ROOT, s), "utf8");
    if (s === "js/data/damagetypes.js") {
      if (!SWITCH_LINE_RE.test(src)) throw new Error("sim_common: could not find the DAMAGE_TYPES_V2 switch line to patch -- source shape changed");
      src = src.replace(SWITCH_LINE_RE, `const DAMAGE_TYPES_V2 = ${!!switchOn};`);
    }
    vm.runInContext(src, ctx, { filename: s });
  }
  const G = (name) => vm.runInContext(name, ctx);

  // ---- harness-only variant-pin hook (lives only in this file, never
  // touches js/ -- the Step 4 handoff's own "audit or a test confirms
  // nothing in js/ passes it" is trivially true since nothing is added
  // to js/ at all). ----
  vm.runInContext(
    `var __origPickElementVariant = pickElementVariant;
     var __forceVariantId = null;
     pickElementVariant = function (variants, locationTags) {
       if (__forceVariantId) {
         var found = variants.find(function (v) { return v.id === __forceVariantId; });
         if (found) return found;
       }
       return __origPickElementVariant(variants, locationTags);
     };`,
    ctx
  );
  function setForceVariant(id) { ctx.__forceVariantId = id || null; }

  const origRollEncounterGroup = G("rollEncounterGroup");
  function setSpawnMode(mode) {
    // "alone": force a group of exactly the anchor creature, no escort --
    // same override shape tools/combatsim.js already uses for its own
    // solo sim. "asSpawned": the real, unmodified roll (natural pack).
    if (mode === "alone") {
      vm.runInContext(
        `rollEncounterGroup = function (id) { var t = BESTIARY[id]; return [{ id: id, dangerClass: (t && t.dangerClass) || "normal" }]; };`,
        ctx
      );
    } else {
      ctx.rollEncounterGroup = origRollEncounterGroup;
    }
  }

  const BESTIARY = G("BESTIARY"), ITEM_DEFS = G("ITEM_DEFS"), EQUIP_SLOTS = G("EQUIP_SLOTS"), GameState = G("GameState");
  const ORIGINS = G("ORIGINS"), ALLY_DEFS = G("ALLY_DEFS"), INJURY_SLOT_DEFS = G("INJURY_SLOT_DEFS");
  const CLASS_IDS = ["warrior", "scout", "apothecary", "mage", "bruise"];
  const ELEMENTS_FOR_SIM = ["fire", "water", "earth", "air", "lightning"]; // same roster tools/combatsim.js uses -- unaffected either side of the switch (Frost has no player-usable signature ability; A3 is pending Tyler and explicitly NOT implemented this step)

  const gearTier = (L) => (L < 6 ? 1 : L < 12 ? 2 : L < 18 ? 3 : 4);
  const gearCache = {};
  function gearFor(L, primary) {
    const key = gearTier(L) + primary;
    if (gearCache[key]) return gearCache[key];
    const eq = {};
    for (const slot of EQUIP_SLOTS) {
      if (slot === "trinkets") continue;
      let best = null, bestScore = -1;
      for (const [id, d] of Object.entries(ITEM_DEFS)) {
        if (d.slot !== slot || !d.bonuses || Number(d.rarity || d.tier) !== gearTier(L)) continue;
        const sc = (d.bonuses[primary] || 0) + (d.bonuses.def || 0) + (d.bonuses.health || 0) * 0.5;
        if (sc > bestScore) { bestScore = sc; best = id; }
      }
      if (best) eq[slot] = best;
    }
    return (gearCache[key] = eq);
  }
  // plus3_run.js's own "3 gear tiers" (tools/combat_1e_completion_gapfix_tables.md
  // line 8, tools/groundbreaker_accuracy_fix_before_after.md line 37):
  // undocumented beyond the name itself in every surviving doc -- reconstructed
  // here as one level-band below / at-level / one level-band above the
  // target's own gear tier, which is the natural reading of "3 gear tiers"
  // against a single fixed boss level. Flagged as a reconstruction choice.
  function gearForTierOffset(L, primary, offset) {
    const t = Math.max(1, Math.min(4, gearTier(L) + offset));
    const key = "tier" + t + primary;
    if (gearCache[key]) return gearCache[key];
    const eq = {};
    for (const slot of EQUIP_SLOTS) {
      if (slot === "trinkets") continue;
      let best = null, bestScore = -1;
      for (const [id, d] of Object.entries(ITEM_DEFS)) {
        if (d.slot !== slot || !d.bonuses || Number(d.rarity || d.tier) !== t) continue;
        const sc = (d.bonuses[primary] || 0) + (d.bonuses.def || 0) + (d.bonuses.health || 0) * 0.5;
        if (sc > bestScore) { bestScore = sc; best = id; }
      }
      if (best) eq[slot] = best;
    }
    return (gearCache[key] = eq);
  }

  function makePlayer(cls, L) {
    const s = new GameState();
    s.race = "human";
    s.class = cls;
    s.origin = Object.keys(ORIGINS)[0];
    s.level = L;
    if (cls === "mage" || cls === "bruise") {
      s.flags.isMage = true;
      s.primaryElement = ELEMENTS_FOR_SIM[Math.floor(Math.random() * ELEMENTS_FOR_SIM.length)];
    }
    return s;
  }
  function equipPlayer(s, L, gearFn) {
    for (const [slot, item] of Object.entries(gearFn(L, s.flags.isMage ? "magic" : "atk"))) s.equipment[slot] = item;
    s.recomputeStats(false);
  }

  if (!ALLY_DEFS.__sim_merc_fill) {
    ALLY_DEFS.__sim_merc_fill = Object.assign({}, ALLY_DEFS.kessa, { name: "Mercenary", abilityKit: undefined });
  }
  const MERC_QUALITY = 0.725; // same scaling tools/combatsim.js's own --party mode already uses for a generic merc
  // "legal full party" (task #56's own documented composition): player +
  // Kessa + Hadrian + 1 generic merc filling the 3rd MAX_PARTY_ALLIES slot.
  // Using the REAL named allies (not 3 generic mercs, unlike combatsim.js's
  // own --party mode) matters here specifically because Hadrian's own kit
  // is one of this handoff's own named expected movers (Part C step 4:
  // "Hadrian and the Warriors... take more from spells").
  function buildLegalParty(s, L, gearFn) {
    const kessa = s.recruitAlly("kessa");
    for (const [slot, item] of Object.entries(gearFn(L, "atk"))) kessa.equipment[slot] = item;
    G("recomputeAllyStats")(kessa, L);
    const hadrian = s.recruitAlly("hadrian");
    for (const [slot, item] of Object.entries(gearFn(L, "atk"))) hadrian.equipment[slot] = item;
    G("recomputeAllyStats")(hadrian, L);
    const merc = s.recruitAlly("__sim_merc_fill");
    for (const [slot, item] of Object.entries(gearFn(L, "atk"))) merc.equipment[slot] = item;
    G("recomputeAllyStats")(merc, L);
    merc.atk = Math.round(merc.atk * MERC_QUALITY);
    merc.def = Math.round(merc.def * MERC_QUALITY);
    merc.maxHealth = Math.round(merc.maxHealth * MERC_QUALITY);
    merc.health = merc.maxHealth;
  }

  function injuryGroupsOf(s) {
    const out = {};
    for (const inj of s.injuries || []) {
      const def = INJURY_SLOT_DEFS[inj.id];
      const g = def ? def.group : "unknown";
      out[g] = (out[g] || 0) + 1;
    }
    return out;
  }

  // one call to playerAttack == one full round: beginTurn + resolveRemainingInitiativeActions
  // already drive every ally's and every enemy's turn inside that single call
  // (confirmed by reading js/engine/pipeline.js's own playerAttack body).
  function runFight(opts) {
    const { cls, L, spawn, party, forceVariant, spawnMode, maxRounds } = opts;
    setSpawnMode(spawnMode || "asSpawned");
    const s = makePlayer(cls, L);
    equipPlayer(s, L, opts.gearFn || gearFor);
    if (party) buildLegalParty(s, L, opts.gearFn || gearFor);
    setForceVariant(forceVariant || null);
    G("startCombat")(s, spawn, L);
    setForceVariant(null);
    if (!s.combat) return null;
    let rounds = 0;
    const cap = maxRounds || 200;
    // A downed-but-not-dead player (state.playerDowned -- "downed, not
    // dead", task #40) stays `alive` per combatant.js's own definition
    // and the fight keeps going without them, resolved each round by
    // resolveDownedRound (js/engine/parser.js's own dispatch, line
    // ~140-144: any verb while downed just advances the round) instead
    // of playerAttack. Missing this the first time this file was
    // written silently zeroed every injury-group tally (a fight lost
    // outright never logs an injury -- only one survived while downed
    // does, per resolvePlayerDefeatOrDowned's own comment) -- caught
    // and fixed before any real N=1000 run.
    while (s.combat && (s.health > 0 || s.playerDowned) && rounds < cap && s.combat.enemies.some((e) => e.alive && e.hp > 0)) {
      if (s.playerDowned) G("resolveDownedRound")(s);
      else G("playerAttack")(s);
      rounds++;
    }
    const enemiesAlive = s.combat && s.combat.enemies.some((e) => e.alive && e.hp > 0);
    const won = (s.health > 0 || s.playerDowned) && !enemiesAlive;
    const allyDeaths = (s.party || []).filter((a) => !a.alive).length;
    return { rounds, won, timedOut: rounds >= cap, allyDeaths, playerHpFrac: Math.max(0, s.health) / s.maxHealth, wasDowned: !!s.playerDowned, injuryGroups: injuryGroupsOf(s) };
  }

  function spawnEnemyMage(nationId, level, element) {
    const tier = Math.max(1, Math.min(5, Math.ceil(level / 5)));
    const mage = G("generateEnemyMage")(nationId, tier, level);
    mage.element = element; // direct override on the already-built dynamic creature object -- no js/ change needed, same technique as the variant-pin hook above
    return mage;
  }

  return {
    G, BESTIARY, CLASS_IDS, gearFor, gearForTierOffset, gearTier, makePlayer, equipPlayer,
    buildLegalParty, runFight, injuryGroupsOf, spawnEnemyMage, setForceVariant, setSpawnMode,
  };
}

module.exports = { buildSandbox, ROOT };
