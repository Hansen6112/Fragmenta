#!/usr/bin/env node
/*
 * Damage Types spec v1.0, "Content Load (Step 3 Data)" handoff: loads
 * the three big reviewed CSVs (damage-types-candidates/1_weapons.csv,
 * 2_enemy_abilities.csv, 3_creatures.csv -- ~1,000 rows total) onto
 * ITEM_DEFS/ENEMY_ABILITIES/BESTIARY by patching the source files
 * in place, rather than by hand (the handoff's own instruction, to
 * avoid typos at this scale).
 *
 * Idempotent: safe to rerun if a CSV changes -- every patch first
 * checks whether the target field is already present on that entry
 * and leaves it alone if so (so a second run with the same CSVs is a
 * no-op, and a narrower second run with a corrected CSV only touches
 * the rows that actually changed).
 *
 * Held rows (proposed === "(unassigned)") and non-weapon/generic/
 * fromCreature markers are skipped per the handoff's own table (§1).
 *
 * Usage: node tools/load_damage_types_content.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CANDIDATES = path.join(ROOT, "damage-types-candidates");

// ---- tiny CSV parser (handles quoted fields with embedded commas/quotes) ----
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (c === "\r") {
      // skip
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length && rows[rows.length - 1].every((f) => f === "")) rows.pop();
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => (obj[h] = r[i] !== undefined ? r[i] : ""));
    return obj;
  });
}

function readCSV(name) {
  return parseCSV(fs.readFileSync(path.join(CANDIDATES, name), "utf8"));
}

// Quotes a value for insertion into a JS object literal as a string.
function q(v) {
  return JSON.stringify(v);
}

let summary = { weapons: 0, abilities: 0, creatures_attackType: 0, creatures_dmgTags: 0, creatures_statusImmune: 0, skipped: [] };

// ======================= 1. weapons.csv -> ITEM_DEFS =======================
function loadWeapons() {
  const rows = readCSV("1_weapons.csv");
  const file = path.join(ROOT, "js/data/items.js");
  let text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");

  for (const row of rows) {
    const item = row.item;
    const proposed = row.proposed;
    if (!item) continue;
    if (proposed === "(not a weapon)" || proposed === "(unassigned)") continue;
    // Find the entry's line: `  "item name": { ... }` or `  BareKey: { ... }`.
    const quotedKeyLine = `  ${q(item)}: {`;
    const bareKeyLine = /^[A-Za-z_$][\w$]*$/.test(item) ? `  ${item}: {` : null;
    let idx = lines.findIndex((l) => l.startsWith(quotedKeyLine));
    if (idx < 0 && bareKeyLine) idx = lines.findIndex((l) => l.startsWith(bareKeyLine));
    if (idx < 0) {
      summary.skipped.push(`weapon not found in ITEM_DEFS: ${item}`);
      continue;
    }
    if (/\bdamageType:/.test(lines[idx])) continue; // already loaded
    // Insert right after the opening `{` of the entry (the first one on
    // the line -- every ITEM_DEFS entry is single-line).
    lines[idx] = lines[idx].replace(/\{/, `{ damageType: ${q(proposed)},`);
    summary.weapons++;
  }
  fs.writeFileSync(file, lines.join("\n"));
}

// ================ 2. enemy_abilities.csv -> ENEMY_ABILITIES ================
function loadEnemyAbilities() {
  const rows = readCSV("2_enemy_abilities.csv");
  const file = path.join(ROOT, "js/data/enemyabilities.js");
  let text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");

  for (const row of rows) {
    const ability = row.ability;
    const proposed = row.proposed;
    if (!ability) continue;
    if (proposed === "(attacker's basic type)") continue; // no field -- engine falls back to weapon/attackType
    const value = proposed.startsWith("(by creature:") ? "fromCreature" : proposed;
    const keyLine = `  ${ability}: {`;
    const idx = lines.findIndex((l) => l.startsWith(keyLine));
    if (idx < 0) {
      summary.skipped.push(`ability not found in ENEMY_ABILITIES: ${ability}`);
      continue;
    }
    if (/\bdamageType:/.test(lines[idx])) continue; // already loaded (the 5 fromCreature abilities from A5, or a rerun)
    lines[idx] = lines[idx].replace(/\{/, `{ damageType: ${q(value)},`);
    summary.abilities++;
  }
  fs.writeFileSync(file, lines.join("\n"));
}

// ===================== 3. creatures.csv -> BESTIARY =====================
// Non-physical families (T1, js/data/damagetypes.js DAMAGE_TYPE_FAMILIES):
// elemental + corrosive + metaphysical -- what "all non-physical:resist"
// (Elder Lorvaun-Nauri's Crystal Core, confirmed by Tyler 12 Nov) expands to.
const NON_PHYSICAL_TYPES = [
  "fire", "frost", "water", "air", "lightning", "earth", // elemental
  "acid", "poison", // corrosive
  "force", "spatial", "spirit", "necrotic", "divine", // metaphysical
];

function parseTagsField(raw) {
  // "frost:resist" / "poison:immune; blunt:weak" / "all non-physical:resist"
  if (!raw) return null;
  const out = {};
  for (const part of raw.split(";")) {
    const [typeRaw, tagRaw] = part.split(":").map((s) => s.trim());
    if (!typeRaw || !tagRaw) continue;
    if (typeRaw === "all non-physical") {
      for (const t of NON_PHYSICAL_TYPES) out[t] = tagRaw;
    } else {
      out[typeRaw] = tagRaw;
    }
  }
  return Object.keys(out).length ? out : null;
}

function loadCreatures() {
  const rows = readCSV("3_creatures.csv");
  const file = path.join(ROOT, "js/data/bestiary.js");
  const lines = fs.readFileSync(file, "utf8").split("\n");

  for (const row of rows) {
    const creature = row.creature;
    if (!creature) continue;
    const keyLine = `  ${creature}: {`;
    const startIdx = lines.findIndex((l) => l === keyLine);
    if (startIdx < 0) {
      summary.skipped.push(`creature not found in BESTIARY: ${creature}`);
      continue;
    }
    // Find this entry's matching close (`  },`) -- entries don't nest
    // another object at the same 2-space indent, so the first `  },`
    // after startIdx is always this entry's own close.
    let endIdx = startIdx + 1;
    while (endIdx < lines.length && lines[endIdx] !== "  }," && lines[endIdx] !== "  }") endIdx++;
    const blockText = lines.slice(startIdx, endIdx + 1).join("\n");

    const toInsert = [];

    // ---- attackType ----
    const rawAttack = row.attackType || "";
    if (!/\battackType:/.test(blockText)) {
      if (rawAttack === "(from weapon)" || rawAttack === "" || rawAttack.startsWith("slashing (weapon:")) {
        // no field -- equipped weapon decides (or, for Dregnar, a bespoke
        // hardcoded weapon type already handled elsewhere)
      } else if (rawAttack === "(variant element)") {
        toInsert.push(`    attackType: "fromCreature",`);
        summary.creatures_attackType++;
      } else {
        toInsert.push(`    attackType: ${q(rawAttack)},`);
        summary.creatures_attackType++;
      }
    }

    // ---- dmgTags ----
    if (!/\bdmgTags:/.test(blockText)) {
      const tags = parseTagsField(row.proposed_tags);
      if (tags) {
        const pairs = Object.entries(tags).map(([k, v]) => `${k}: ${q(v)}`).join(", ");
        toInsert.push(`    dmgTags: { ${pairs} },`);
        summary.creatures_dmgTags++;
      }
    }

    // ---- statusImmune ----
    if (!/\bstatusImmune:/.test(blockText)) {
      const raw = (row.status_immune || "").trim();
      if (raw) {
        const list = raw.split(/\s+/).filter(Boolean);
        toInsert.push(`    statusImmune: [${list.map(q).join(", ")}],`);
        summary.creatures_statusImmune++;
      }
    }

    if (toInsert.length) {
      // Insert right after the opening line (startIdx) -- simplest stable
      // anchor, consistent regardless of whether a `tags:` (habitat)
      // line exists on this entry.
      lines.splice(startIdx + 1, 0, ...toInsert);
    }
  }
  fs.writeFileSync(file, lines.join("\n"));
}

loadWeapons();
loadEnemyAbilities();
loadCreatures();

console.log(`weapons: ${summary.weapons} damageType fields set`);
console.log(`enemy abilities: ${summary.abilities} damageType fields set`);
console.log(`creatures: ${summary.creatures_attackType} attackType, ${summary.creatures_dmgTags} dmgTags, ${summary.creatures_statusImmune} statusImmune fields set`);
if (summary.skipped.length) {
  console.log(`\n${summary.skipped.length} row(s) could not be matched to an existing entry:`);
  for (const s of summary.skipped) console.log(`  - ${s}`);
}
