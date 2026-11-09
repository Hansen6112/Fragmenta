/*
 * FRAGMENTA — Combat Rebuild Phase 1, Step 1a: the combatant view.
 *
 * "Wrap first, move later" (spec section 2.1): the player's data stays on
 * `state`, allies stay at `state.party[i]`, enemies stay at
 * `state.combat.enemies[i]`. Nothing here copies or mirrors a field — each
 * combatant view is a thin, live wrapper over whichever storage already
 * holds that fighter's data, so existing code that reads/writes
 * state.health, ally.atk, enemy.hp, etc. keeps working completely
 * unchanged. Nothing in combat.js is rewired to use this yet; that happens
 * path-by-path in steps 1b-1g as each one is migrated into the five-step
 * pipeline. This file is purely additive in step 1a.
 *
 * stat(state, combatant, key) is the single accessor every migrated path
 * will call instead of effectivePlayerAtk/effectiveAllyDef/
 * effectiveEnemyAtk/etc. Each branch below calls today's existing
 * function UNCHANGED — Phase 1 only unifies the entry point. Phase 2
 * (the modifier registry) replaces what's inside each branch.
 *
 * Several ally/enemy "effective" stats (ally atk/def/acc, enemy def as
 * seen by an attacker) are NOT centralized functions today — they're
 * computed inline, per call site, in allyAggressiveAction/
 * basicCompanionAttack/rollPlayerDamage/etc., several of them with a
 * side-effecting consumption of banked defense bonuses (Brace, Guarded
 * Strike, Sure Foundation) that must happen exactly once per hit. Forcing
 * those into stat() now, ahead of the step that actually migrates their
 * call site into the pipeline, would risk exactly the kind of silent
 * behavior drift the parity gates (spec section 5) exist to catch. So
 * stat() deliberately throws for those keys until the step that owns that
 * call site lands (ally atk/def/acc: step 1c/1d; enemy def-as-attacked:
 * step 1d/1e) and extracts the real function there, on purpose, with its
 * own forced-roll parity test.
 *
 * HARD RULE, binding from here through every later step (flagged by Tyler,
 * 6 Nov, ahead of 1b setting the pipeline's shape): stat() must never
 * mutate anything, and that includes consuming a one-shot banked bonus.
 * When enemy "def" is extracted out of its inline call sites (1d/1e), the
 * extracted function must report Brace/Guarded Strike/Sure Foundation's
 * current value WITHOUT zeroing it — reading a stat, including reading it
 * twice, or reading it to show a number nobody acts on, must be side-
 * effect-free. The actual one-shot consumption (zeroing those banked
 * fields) belongs in pipeline step 5 (applyAndReact), once per resolved
 * hit, same as every other reaction. A `stat()` branch that both reads
 * and consumes a bonus is a bug, not a style choice — this is the shape
 * the five-step pipeline (step 1b) is built around.
 */

function makePlayerCombatant(state) {
  return {
    id: "player",
    side: "party",
    kind: "player",
    get name() { return state.playerName; },
    get level() { return state.level; },
    get archetype() { return state.isMage ? "mage" : "warrior"; },
    get alive() { return state.health > 0 || !!state.playerDowned; },
    get downed() { return !!state.playerDowned; },
    controller: "player",
    store: state.combat,
    ref: state,
  };
}

function makeAllyCombatant(ally) {
  return {
    id: ally.defId,
    side: "party",
    kind: "ally",
    get name() { return ally.name; },
    get level() { return ally.level; },
    get alive() { return !!ally.alive; },
    get downed() { return false; },
    controller: "ally",
    store: ally,
    ref: ally,
  };
}

function makeEnemyCombatant(state, enemySlot, index) {
  return {
    id: enemySlot.creatureId,
    side: "enemy",
    kind: "enemy",
    get name() { return enemySlot.name; },
    get level() { return enemySlot.creatureObj && enemySlot.creatureObj.level; },
    get dangerClass() { return enemySlot.creatureObj && enemySlot.creatureObj.dangerClass; },
    get bestiaryKey() { return enemySlot.creatureObj && enemySlot.creatureObj.bestiaryKey; },
    get alive() { return !!enemySlot.alive; },
    get downed() { return false; },
    controller: enemySlot.creatureObj && enemySlot.creatureObj.special ? "boss" : "enemy",
    index,
    store: enemySlot,
    ref: enemySlot,
  };
}

// Finds the combatant view for a specific creature object, wherever its
// slot currently is in the roster — the pipeline's enemy-side entry point
// (resolveEnemyAttackOnPlayer, etc.) is handed the creature directly, not
// an index, same as the functions it supersedes. Mirrors the existing
// combat.enemies.find((e) => e.creatureObj === creature) lookup
// applyEnemySelfModifier (combat.js) already uses for the same reason:
// "whoever happens to be active" isn't guaranteed to be the one acting.
function findEnemyCombatant(state, creature) {
  const index = state.combat.enemies.findIndex((e) => e.creatureObj === creature);
  if (index === -1) return null;
  return makeEnemyCombatant(state, state.combat.enemies[index], index);
}

// Every living fighter on one side, as combatant views — built fresh each
// call (views are cheap closures over existing storage, nothing to cache).
function partyCombatants(state) {
  const out = [makePlayerCombatant(state)];
  (state.party || []).forEach((ally) => out.push(makeAllyCombatant(ally)));
  return out;
}
function enemyCombatants(state) {
  if (!state.combat) return [];
  return state.combat.enemies.map((e, i) => makeEnemyCombatant(state, e, i));
}

function notYetMigrated(kind, key) {
  throw new Error(`stat(): "${key}" for kind "${kind}" is not centralized yet — its call sites are migrated (and this branch filled in) in a later Phase 1 step, not 1a. See js/engine/combatant.js header.`);
}

function stat(state, combatant, key) {
  if (combatant.kind === "player") {
    switch (key) {
      // atk: peekPlayerAtk (combat.js), not effectivePlayerAtk -- step 1e
      // handoff §3.2 purity fix. effectivePlayerAtk itself is unchanged
      // and still consumes the Siege Corps one-shot charge on every call
      // (every not-yet-migrated caller -- rollPlayerDamage, and
      // everything that still calls it -- needs that); stat() is the
      // NEW, generic accessor the pipeline uses, and reading a stat must
      // never mutate state (this function's own hard rule) — the
      // pipeline's applyAndReactPlayerActor (pipeline.js) is what
      // actually spends the charge now, once, after a resolved hit.
      case "atk": return peekPlayerAtk(state);
      case "def": return effectivePlayerDef(state);
      case "agi": return effectivePlayerAgility(state);
      case "acc": return effectivePlayerAccuracy(state);
      case "spd": return effectivePlayerSpeedForInitiative(state);
      case "magic": return state.magic;
      case "knowledge": return state.knowledge;
      case "maxHp": return state.maxHealth;
      case "hp": return state.health;
      default: return notYetMigrated("player", key);
    }
  }
  if (combatant.kind === "ally") {
    const ally = combatant.ref;
    switch (key) {
      case "spd": return effectiveAllySpeed(ally);
      // def/agi: centralized in step 1c, the step that reaches
      // resolveEnemyAttackOnAlly's call site (an ally defending against an
      // enemy attack). effectiveAllyDef already existed (companion.js);
      // effectiveAllyAgility was extracted from that same function's
      // inline calc, same zero-behavior-change move as everything else in
      // this file.
      case "def": return effectiveAllyDef(ally);
      case "agi": return effectiveAllyAgility(ally);
      // atk/acc: centralized in step 1d, the step that reaches the
      // plain-ally (no abilityKit) attack call site
      // (allyAggressiveActionLegacy's old body, now pipeline.js). This is
      // ONLY the plain-ally formula — a kit-bearing ally's own attack/
      // accuracy (companion.js's basicCompanionAttack/useHadrianActive)
      // stays a separate, kit-specific calculation the pipeline's ally-
      // actor branches call directly, never through stat() — see
      // effectiveAllyAtk's own comment (companion.js) for why unifying
      // them would be an undisclosed balance change.
      case "atk": return effectiveAllyAtk(ally);
      case "acc": return effectiveAllyAcc(ally);
      case "magic": return ally.magic;
      case "knowledge": return ally.knowledge;
      case "maxHp": return ally.maxHealth;
      case "hp": return ally.health;
      default: return notYetMigrated("ally", key);
    }
  }
  if (combatant.kind === "enemy") {
    const creature = combatant.ref.creatureObj;
    switch (key) {
      case "atk": return effectiveEnemyAtk(state, creature);
      case "acc": return creature.acc || 0;
      case "agi": return creature.agi || 0;
      case "spd": return creature.spd || 0;
      case "magic": return creature.magic;
      case "maxHp": return combatant.ref.maxHp;
      case "hp": return combatant.ref.hp;
      // def: the PURE part only (creature.def, no banked bonus) — step
      // 1d. Brace/Guarded Strike/Sure Foundation's live banked bonus is
      // read SEPARATELY at the pipeline's ally-actor calculateDamage call
      // site (pipeline.js), summed with this value, exactly like the
      // ally-as-target branch already does for ally.braceBonusDef/
      // guardedStrikeBonusDef (step 1c) — never folded in here, per the
      // stat()-purity rule. The actual one-shot zeroing (+ Sure
      // Foundation's immediate re-grant) happens once, in applyAndReact
      // (step 5), moved there from allyAggressiveActionLegacy's old
      // pre-damage-calc timing — see pipeline.js's own comment on why
      // that reorder is safe.
      case "def": return creature.def || 0;
      default: return notYetMigrated("enemy", key);
    }
  }
  throw new Error(`stat(): unknown combatant kind "${combatant.kind}"`);
}
