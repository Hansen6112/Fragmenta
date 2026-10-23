#!/usr/bin/env node
/*
 * FRAGMENTA — Combat balance simulator (dev tool, never loaded by the game)
 *
 *   node tools/combatsim.js                 # every BESTIARY creature: summary by Danger Class
 *   node tools/combatsim.js wildBoar drake  # just these creatures, with suggested stat fixes
 *   node tools/combatsim.js --off           # every creature >35% off its target, with suggestions
 *   node tools/combatsim.js --fights 20     # more fights per class per creature (default 8)
 *
 * Runs the REAL engine headless (same sandbox approach as tools/audit.js):
 * a level-matched player of each of the five Classes, in the best tier-
 * appropriate gear (drops cap at Masterwork, so tier 1/2/3/4 at levels
 * 1-5/6-11/12-17/18+), fights each creature SOLO at the center of its own
 * level band using basic Attack only. It reports:
 *
 *   TTK — rounds to kill   (creature max HP / damage dealt per round)
 *   TTD — rounds to die    (player max HP / damage taken per round)
 *
 * measured as pooled per-round rates (not per-fight outcomes), so a fight
 * the player loses still says how fast they were killing it.
 *
 * Targets are the v0.11 Danger Class bands (see data/creaturetags.js
 * DANGER_CLASS_STAT_MULTS), skewed by Archetype so identity survives
 * tuning: TTK target x (archetype health x sqrt(archetype defense)), TTD
 * target / archetype attack. An Assassin is MEANT to land under the
 * Normal band's TTK and TTD; a Tank over both. The bands describe the
 * baseline player — tactics, cooldowns, consumables and allies are
 * supposed to beat them.
 *
 * Suggested fixes are one-step estimates for the species' hand-authored
 * hp/atk (TTK scales ~linearly with HP; damage taken ~atk^1.4 under the
 * ratio Defense rule) — re-run after applying, it converges in 2-3 rounds.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const fightsIdx = args.indexOf("--fights");
const N = fightsIdx >= 0 ? Number(args[fightsIdx + 1]) || 8 : 8;
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--fights");

// ---- sandbox (mirrors tools/audit.js) ----
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
for (const s of scripts) vm.runInContext(fs.readFileSync(path.join(ROOT, s), "utf8"), ctx, { filename: s });
const G = (name) => vm.runInContext(name, ctx);
// Solo fights only — packs/leader underlings are reported separately as a
// known gap (bands are 1v1 numbers).
G("rollEncounterGroup = function (id) { const t = BESTIARY[id]; return [{ id, dangerClass: (t && t.dangerClass) || 'normal' }]; }");

const BESTIARY = G("BESTIARY"), ITEM_DEFS = G("ITEM_DEFS"), EQUIP_SLOTS = G("EQUIP_SLOTS"), GameState = G("GameState");
const ARCHETYPES = G("ARCHETYPES"), SPAWN_RARITIES = G("SPAWN_RARITIES"), ORIGINS = G("ORIGINS");
const CLASS_IDS = ["warrior", "scout", "apothecary", "mage", "bruise"];
const ELEMENTS_FOR_SIM = ["fire", "water", "earth", "air", "lightning"];
const CENTER = { normal: { ttk: 4, ttd: 14 }, elite: { ttk: 8, ttd: 9 }, boss: { ttk: 20, ttd: 7 }, world_boss: { ttk: 40, ttd: 4.5 } };

const gearTier = (L) => (L < 6 ? 1 : L < 12 ? 2 : L < 18 ? 3 : 4); // Masterwork only drops from Epic/Unique kills (L15+); full best-in-slot lags first access
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
  for (const [slot, item] of Object.entries(gearFor(L, s.flags.isMage ? "magic" : "atk"))) s.equipment[slot] = item;
  s.recomputeStats(false);
  return s;
}
function fight(cls, L, id) {
  const s = makePlayer(cls, L);
  G("startCombat")(s, id, L);
  if (!s.combat) return null;
  const e0 = s.combat.enemies[0];
  let dealt = 0, taken = 0, rounds = 0;
  while (s.combat && s.health > 0 && rounds < 150 && e0.alive && e0.hp > 0) {
    const eh = e0.hp, ph = s.health;
    G("playerAttack")(s);
    rounds++;
    dealt += Math.max(0, eh - Math.max(0, e0.hp));
    taken += Math.max(0, ph - s.health);
  }
  return { rounds, dealt, taken, maxHp: e0.maxHp, php: s.maxHealth, won: s.health > 0 && !(e0.hp > 0) };
}
function centerLevel(t) {
  if (t.levelRange) return Math.round((t.levelRange[0] + t.levelRange[1]) / 2);
  const r = SPAWN_RARITIES[t.spawnRarity || "common"];
  return Math.round((r.levelMin + Math.min(r.levelMax, 25)) / 2);
}
function target(t) {
  const a = ARCHETYPES[t.archetype] || { health: 1, attack: 1, defense: 1 };
  const c = CENTER[t.dangerClass || "normal"];
  return { ttk: c.ttk * a.health * Math.sqrt(a.defense), ttd: c.ttd / a.attack };
}
function measure(id) {
  const t = BESTIARY[id];
  const L = G("clampLevelToRarityBand")(centerLevel(t), t.spawnRarity, t.levelBandExempt);
  let D = 0, T = 0, R = 0, hp = 0, php = 0, wins = 0, n = 0;
  for (const cls of CLASS_IDS) for (let i = 0; i < N; i++) {
    const r = fight(cls, L, id);
    if (!r || !r.rounds) continue;
    D += r.dealt; T += r.taken; R += r.rounds; hp += r.maxHp; php += r.php; wins += r.won ? 1 : 0; n++;
  }
  if (!n) return null;
  const ttk = hp / n / Math.max(1e-3, D / R);
  const ttd = T > 0 ? Math.min(99, php / n / (T / R)) : 99;
  return { id, L, ttk, ttd, win: wins / n, target: target(t), dc: t.dangerClass || "normal", arch: t.archetype || "-" };
}
function suggest(m) {
  const t = BESTIARY[m.id];
  const out = [];
  const hpFix = Math.round(t.hp * (m.target.ttk / m.ttk));
  if (Math.abs(m.ttk / m.target.ttk - 1) > 0.15) out.push(`hp ${t.hp} -> ~${Math.max(1, hpFix)}`);
  if (t.atk && m.ttd < 99 && Math.abs(m.ttd / m.target.ttd - 1) > 0.15) {
    const atkFix = Math.max(1, Math.round(t.atk * Math.pow(m.ttd / m.target.ttd, 0.7)));
    out.push(atkFix === t.atk
      ? `atk already at its floor — the remaining damage is gear, abilities or summons`
      : `atk ${t.atk} -> ~${atkFix}`);
  }
  return out.length ? out.join(", ") + " (approx; re-run)" : "on target";
}

const ids = (only.length ? only : Object.keys(BESTIARY)).filter((id) => BESTIARY[id] && !BESTIARY[id].special);
const results = ids.map(measure).filter(Boolean);
const fmt = (x) => x.toFixed(1).padStart(5);
const off = (m) => m.ttk > m.target.ttk * 1.35 || m.ttk < m.target.ttk / 1.35 || m.ttd > m.target.ttd * 1.35 || m.ttd < m.target.ttd / 1.35;

if (only.length || flag("--off")) {
  for (const m of results.filter((r) => only.length || off(r))) {
    console.log(`${m.id.padEnd(28)} ${m.dc.padEnd(10)} ${m.arch.padEnd(10)} L${String(m.L).padEnd(3)} TTK ${fmt(m.ttk)} (target ${fmt(m.target.ttk)})  TTD ${fmt(m.ttd)} (target ${fmt(m.target.ttd)})  win ${(m.win * 100).toFixed(0).padStart(3)}%  -> ${suggest(m)}`);
  }
} else {
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  for (const dc of Object.keys(CENTER)) {
    const g = results.filter((r) => r.dc === dc);
    if (!g.length) continue;
    console.log(`${dc.padEnd(11)} n=${String(g.length).padEnd(4)} median TTK ${fmt(med(g.map((r) => r.ttk)))} (band ${CENTER[dc].ttk})  median TTD ${fmt(med(g.map((r) => r.ttd)))} (band ${CENTER[dc].ttd})  basic-attack win ${(med(g.map((r) => r.win)) * 100).toFixed(0)}%  off-target ${g.filter(off).length}`);
  }
  console.log("\n(run with --off to list off-target creatures with suggested fixes)");
}
