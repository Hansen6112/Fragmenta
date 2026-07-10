/*
 * FRAGMENTA — Command Parser
 * A text-adventure verb parser with fuzzy object matching. Anything it
 * doesn't recognize as a known verb falls through to the hybrid generative
 * layer (engine/generator.js) instead of a hard error.
 */

const VERB_SYNONYMS = {
  look: ["look", "l", "observe"],
  go: ["go", "travel", "walk", "head", "move", "enter", "return"],
  map: ["map", "atlas", "locations"],
  inventory: ["inventory", "i", "inv", "items"],
  take: ["take", "get", "grab", "pickup", "pick"],
  drop: ["drop", "discard"],
  equip: ["equip", "wear", "wield"],
  unequip: ["unequip", "unwear", "unwield", "remove"],
  equipment: ["equipment", "gear", "worn"],
  examine: ["examine", "x", "inspect", "study"],
  talk: ["talk", "speak", "ask", "greet"],
  rest: ["rest", "sleep", "camp"],
  status: ["status", "stats", "health", "hp", "level", "xp"],
  lore: ["lore", "codex", "recall", "remember"],
  fight: ["fight", "attack", "strike", "hit"],
  explore: ["explore", "search", "scout"],
  flee: ["flee", "run", "escape", "retreat"],
  leave: ["leave", "ignore", "pass"],
  help: ["help", "commands"],
  save: ["save"],
  quests: ["quest", "quests", "journal"],
  reputation: ["reputation", "rep", "standing", "factions"],
  board: ["board", "jobs", "noticeboard", "postings"],
  contracts: ["contracts", "guildcontracts"],
  accept: ["accept", "claim"],
  sign: ["sign"],
  feint: ["feint"],
  decoy: ["decoy"],
  ambush: ["ambush"],
  disarm: ["disarm"],
  ignite: ["ignite"],
  torrent: ["torrent"],
  stoneskin: ["stoneskin"],
  flurry: ["flurry"],
  corrode: ["corrode"],
  concuss: ["concuss"],
  blink: ["blink"],
  windcut: ["windcut"],
  skills: ["skills", "tactics"],
  choose: ["choose", "attune", "focus"],
};

// Single-letter shorthand ("i", "l", "x") only counts as a command when it's
// the entire input — otherwise "I just want to..." would hijack inventory.
function resolveVerb(word, isOnlyWord) {
  for (const [verb, synonyms] of Object.entries(VERB_SYNONYMS)) {
    for (const syn of synonyms) {
      if (syn.length === 1 && !isOnlyWord) continue;
      if (syn === word) return verb;
    }
  }
  return null;
}

function stripLeadingWords(str, words) {
  let s = str.trim();
  for (const w of words) {
    const re = new RegExp("^" + w + "\\s+", "i");
    s = s.replace(re, "");
  }
  return s;
}

async function handleInput(rawInput, state) {
  const input = rawInput.trim();
  if (!input) return [];
  const lower = input.toLowerCase();
  const words = lower.split(/\s+/);
  const verb = resolveVerb(words[0], words.length === 1);
  let arg = stripLeadingWords(lower.slice(words[0].length).trim(), ["to", "at", "the", "with"]);

  // Combat takes priority for a small set of verbs
  if (state.combat) {
    if (verb === "fight") return playerAttack(state);
    if (verb === "flee") return attemptFlee(state);
    if (verb === "feint") return useFeint(state);
    if (verb === "decoy") return useDecoy(state);
    if (verb === "ambush") return useAmbush(state);
    if (verb === "disarm") return useDisarm(state);
    if (ELEMENT_VERB_TO_KEY[verb]) return useElementAbility(state, ELEMENT_VERB_TO_KEY[verb]);
    if (verb === "leave" && getCombatCreature(state).friendly) {
      const name = state.combat.name;
      state.combat = null;
      return [`You leave ${withThe(name, false)} in peace.`];
    }
    if (verb === "talk" && getCombatCreature(state).friendly) {
      state.combat = null;
      state.health = Math.min(state.maxHealth, state.health + 6);
      return [
        "It tilts its great bark-covered head toward you. No words — just a sound like creaking wood, structured, patient.",
        "Warmth spreads through a wound you didn't realize still ached. You heal 6 health.",
      ];
    }
    if (verb !== "status" && verb !== "look" && verb !== "inventory" && verb !== "equipment" && verb !== "skills" && verb !== "choose") {
      const friendly = getCombatCreature(state).friendly;
      const usable = friendly ? [] : availableActionNames(state);
      const options = ["fight", "flee", ...usable, ...(friendly ? ["talk", "leave"] : [])];
      return [`You're in the middle of an encounter. (${options.join(" / ")})`];
    }
  }

  switch (verb) {
    case "look":
      return cmdLook(state);
    case "go":
      return cmdGo(arg, state);
    case "map":
      return cmdMap(state);
    case "inventory":
      return cmdInventory(state);
    case "take":
      return cmdTake(arg, state);
    case "drop":
      return cmdDrop(arg, state);
    case "equip":
      return cmdEquip(arg, state);
    case "unequip":
      return cmdUnequip(arg, state);
    case "equipment":
      return cmdEquipment(state);
    case "examine":
      return cmdExamine(arg, state);
    case "talk":
      return cmdTalk(arg, state);
    case "rest":
      return cmdRest(state);
    case "status":
      return cmdStatus(state);
    case "lore":
      return cmdLore(arg, state);
    case "explore":
      return cmdExplore(state);
    case "fight":
      return ["There's nothing here to fight. Try 'explore' if you're looking for trouble."];
    case "flee":
      return ["There's nothing to flee from right now."];
    case "quests":
      return cmdQuests(state);
    case "reputation":
      return cmdReputation(state);
    case "board":
      return cmdBoard(state);
    case "contracts":
      return cmdContracts(state);
    case "accept":
      return cmdAccept(arg, state);
    case "sign":
      return cmdSign(arg, state);
    case "skills":
      return cmdSkills(state);
    case "choose":
      return cmdChoose(arg, state);
    case "feint":
    case "decoy":
    case "ambush":
    case "disarm":
    case "ignite":
    case "torrent":
    case "stoneskin":
    case "flurry":
    case "corrode":
    case "concuss":
    case "blink":
    case "windcut":
      return [`Nothing to ${verb} outside a fight. Try 'explore' if you're looking for one.`];
    case "help":
      return cmdHelp();
    case "save":
      state.save();
      return ["Game saved."];
    default:
      return await generateOpenResponse(input, state);
  }
}

// Picks a random reputation-flavor line for the current location's nation,
// or null if reputation there is neutral (the common case — most
// backgrounds only have opinions about a couple of nations).
function reputationFlavorLine(state, nationId) {
  const rep = reputationFor(state, nationId);
  if (rep === "neutral" || !REPUTATION_FLAVOR[rep]) return null;
  const lines = REPUTATION_FLAVOR[rep];
  return lines[Math.floor(Math.random() * lines.length)];
}

function cmdLook(state) {
  const loc = state.currentLocation();
  state.visit(state.location);
  const lines = [`== ${loc.name} ==`, loc.description];
  const exits = loc.connections.map((c) => LOCATIONS[c.to].name).join(", ");
  lines.push(`Paths from here: ${exits}.`);
  if (loc.services && loc.services.length) {
    lines.push(`Services available: ${loc.services.join(", ")}.`);
  }
  if (state.flags.isBruise && loc.nation === "kabal") {
    lines.push("You are standing in the one place in the world you have the most reason to fear. Every minute here is borrowed.");
  } else {
    const repLine = reputationFlavorLine(state, loc.nation);
    if (repLine) lines.push(repLine);
  }
  return lines;
}

function cmdGo(arg, state) {
  if (!arg) return ["Go where?"];
  const loc = state.currentLocation();
  const direct = connectionMatchingName(state.location, arg);
  if (direct) {
    return executeTravel(state, [state.location, direct.to], direct.days);
  }
  const targetId = findLocationByName(arg);
  if (!targetId) return [`You don't know of anywhere called "${arg}".`];
  const result = findPath(state.location, targetId);
  if (!result) return [`There's no known route from here to ${LOCATIONS[targetId].name}.`];
  return executeTravel(state, result.path, result.days);
}

// The Bruise-hunted mechanic: the Kabal's reach is strongest at its own
// territory, in Sanguivorum (its closest ally), and anywhere with an
// institutional ("guild") presence. Only ever fires for state.flags.wanted.
function checkKabalHunt(state, locId) {
  if (!state.flags.wanted || state.combat) return null;
  const loc = LOCATIONS[locId];
  let chance = 0.05;
  if (loc.nation === "kabal") chance = 0.35;
  else if (loc.nation === "sanguivorum") chance = 0.18;
  if (loc.services && loc.services.includes("guild")) chance += 0.07;

  if (Math.random() < chance) {
    const line = KABAL_HUNT_LINES[Math.floor(Math.random() * KABAL_HUNT_LINES.length)];
    return [line, ...startCombat(state, "kabal_enforcer")];
  }
  return null;
}

function executeTravel(state, path, totalDays) {
  const lines = [];
  const destId = path[path.length - 1];
  const dest = LOCATIONS[destId];
  lines.push(`You set out for ${dest.name} — roughly ${totalDays} day${totalDays === 1 ? "" : "s"} of travel.`);

  // roll encounters per leg
  for (let i = 1; i < path.length; i++) {
    const legLoc = LOCATIONS[path[i]];
    const legDanger = legLoc.danger || 1;
    const repMod = reputationFor(state, legLoc.nation) === "hostile" ? 0.05 : 0;
    let chance = Math.max(0, Math.min(0.5, legDanger * 0.07 + repMod - (state.stealthMod || 0) * 0.3));
    if (hasEffect(state, "trailwise")) chance *= hasSetTier(state, "Sahrimor", 4) ? 0.8 : 0.9;
    if (Math.random() < chance) {
      let combatant = null;
      if (Math.random() < ENEMY_MAGE_CHANCE) {
        combatant = generateEnemyMage(legLoc.nation, legDanger);
      } else {
        const tags = TERRAIN_TAGS[legLoc.terrain] || ["continental"];
        const pool = creaturesForTags(tags, legLoc.nation).filter((id) => !BESTIARY[id].unique || !state.flags["defeated_" + id]);
        if (pool.length) combatant = pool[Math.floor(Math.random() * pool.length)];
      }
      if (combatant) {
        state.day += totalDays;
        state.location = path[i];
        state.visit(path[i]);
        lines.push(`Along the way, near ${legLoc.name}:`);
        lines.push(...startCombat(state, combatant));
        return lines;
      }
    }
  }

  state.day += totalDays;
  state.location = destId;
  state.visit(destId);

  const jobLines = checkJobProgressOnArrive(state, destId);

  const hunt = checkKabalHunt(state, destId);
  if (hunt) {
    lines.push(`You arrive at ${dest.name}.`);
    lines.push(...jobLines);
    lines.push(...hunt);
    return lines;
  }

  lines.push(...cmdLook(state));
  lines.push(...jobLines);
  return lines;
}

function cmdMap(state) {
  const loc = state.currentLocation();
  const lines = [`You are at ${loc.name}, ${getNation(loc.nation).name}.`];
  lines.push("Known connections from here:");
  for (const c of loc.connections) {
    const t = LOCATIONS[c.to];
    lines.push(`  -> ${t.name} (${getNation(t.nation).name}) — ~${c.days} day(s) by ${c.mode}${c.desc ? ", " + c.desc : ""}`);
  }
  lines.push(`Visited so far: ${state.visited.size} location(s).`);
  return lines;
}

function cmdInventory(state) {
  if (state.inventory.length === 0) return ["You're carrying nothing.", `Gold: ${state.gold}`];
  return ["You are carrying:", ...state.inventory.map((i) => `  - ${i}`), `Gold: ${state.gold}`];
}

function cmdTake(arg, state) {
  if (!arg) return ["Take what?"];
  const loc = state.currentLocation();
  if (loc.items && loc.items.length) {
    const idx = loc.items.findIndex((i) => i.toLowerCase().includes(arg));
    if (idx >= 0) {
      const item = loc.items.splice(idx, 1)[0];
      state.inventory.push(item);
      return [`You take ${item}.`];
    }
  }
  return [`There's no "${arg}" here to take.`];
}

function cmdDrop(arg, state) {
  if (!arg) return ["Drop what?"];
  const idx = state.inventory.findIndex((i) => i.toLowerCase().includes(arg));
  if (idx < 0) return [`You aren't carrying "${arg}".`];
  const item = state.inventory.splice(idx, 1)[0];
  const loc = state.currentLocation();
  loc.items = loc.items || [];
  loc.items.push(item);
  return [`You leave ${item} behind.`];
}

function cmdEquipment(state) {
  const lines = ["You have equipped:"];
  for (const slot of EQUIP_SLOTS) {
    const label = EQUIP_SLOT_LABELS[slot];
    if (slot === "trinkets") {
      const items = state.equipment.trinkets;
      lines.push(`  ${label}: ${items.length ? items.map(formatItemLine).join("; ") : "(empty)"}`);
    } else {
      const item = state.equipment[slot];
      lines.push(`  ${label}: ${item ? formatItemLine(item) : "(empty)"}`);
    }
  }
  const setLines = describeSetProgress(state);
  if (setLines.length) {
    lines.push("Set bonuses:");
    for (const l of setLines) lines.push(`  ${l}`);
  }
  return lines;
}

// Which slot an item goes in comes from data/items.js's registry when the
// item is a known piece of gear, falling back to data/equipment.js's
// keyword-based inferEquipSlot for anything unlisted (loot the registry
// hasn't caught up with yet) — items are plain strings with no explicit
// type field of their own. Equipping into an already-occupied single-item
// slot auto-unequips the old item back to inventory first; Trinkets (the
// only 2-item slot) is instead a hard block when full, since which of the
// two to bump would be ambiguous. recomputeStats() is called after any
// change since gear bonuses are folded into it directly.
function cmdEquip(arg, state) {
  if (!arg) return ["Equip what?"];
  const idx = state.inventory.findIndex((i) => i.toLowerCase().includes(arg));
  if (idx < 0) return [`You aren't carrying "${arg}".`];
  const item = state.inventory[idx];
  const itemDef = getItemDef(item);
  const slot = itemDef ? itemDef.slot : inferEquipSlot(item);
  if (!slot) return [`${item} isn't something you can equip.`];

  if (slot === "trinkets") {
    // Dual Focus (Artifact): raises the trinket cap from 2 to 3. Checked
    // against the item ALREADY being equipped (any currently-worn Dual
    // Focus trinket counts toward its own cap increase), not the one about
    // to be equipped.
    const trinketCap = hasEffect(state, "dual_focus") ? EQUIP_SLOT_CAPACITY.trinkets + 1 : EQUIP_SLOT_CAPACITY.trinkets;
    if (state.equipment.trinkets.length >= trinketCap) {
      return [trinketCap > EQUIP_SLOT_CAPACITY.trinkets ? "All three trinket slots are already full. Unequip one first." : "Both trinket slots are already full. Unequip one first."];
    }
    const wasPending = state.flags.pendingConduitAscendantChoice;
    state.inventory.splice(idx, 1);
    state.equipment.trinkets.push(item);
    state.recomputeStats(true);
    const lines = [`You equip ${formatItemLine(item)}. (${EQUIP_SLOT_LABELS.trinkets})`];
    if (!wasPending && state.flags.pendingConduitAscendantChoice) lines.push(...conduitAscendantOfferLines(state));
    return lines;
  }

  const lines = [];
  const current = state.equipment[slot];
  if (current) {
    state.equipment[slot] = null;
    state.inventory.push(current);
    lines.push(`You unequip ${current} to make room.`);
  }
  const wasPending = state.flags.pendingConduitAscendantChoice;
  state.inventory.splice(idx, 1);
  state.equipment[slot] = item;
  state.recomputeStats(true);
  lines.push(`You equip ${formatItemLine(item)}. (${EQUIP_SLOT_LABELS[slot]})`);
  if (!wasPending && state.flags.pendingConduitAscendantChoice) lines.push(...conduitAscendantOfferLines(state));
  return lines;
}

// Conduit Ascendant (Artifact): the announcement shown the instant the
// effect first becomes usable (recomputeStats sets the pending flag),
// mirroring the level-15 second-element announcement in state.js.
function conduitAscendantOfferLines(state) {
  return [
    `Conduit Ascendant stirs — you may reach beyond ${ELEMENTS[state.primaryElement].name} and ${ELEMENTS[state.secondaryElement].name} to a third discipline ` +
      `(type 'choose <element>': ${elementList().join(", ")}).`,
  ];
}

function cmdUnequip(arg, state) {
  if (!arg) return ["Unequip what?"];
  for (const slot of EQUIP_SLOTS) {
    if (slot === "trinkets") {
      const idx = state.equipment.trinkets.findIndex((i) => i.toLowerCase().includes(arg));
      if (idx >= 0) {
        const item = state.equipment.trinkets.splice(idx, 1)[0];
        state.inventory.push(item);
        state.recomputeStats(true);
        return [`You unequip ${item}.`];
      }
      continue;
    }
    const current = state.equipment[slot];
    if (current && current.toLowerCase().includes(arg)) {
      state.equipment[slot] = null;
      state.inventory.push(current);
      state.recomputeStats(true);
      return [`You unequip ${current}.`];
    }
  }
  return [`You don't have "${arg}" equipped.`];
}

function cmdExamine(arg, state) {
  if (!arg || arg === "self" || arg === "me") {
    return [`You are ${state.playerName}, day ${state.day} of a journey you didn't fully choose. Health ${state.health}/${state.maxHealth}, ${state.gold} gold.`];
  }
  const loc = state.currentLocation();
  if (arg.includes(loc.name.toLowerCase()) || arg === "here" || arg === "location" || arg === "area") {
    return [loc.description];
  }
  const invItem = state.inventory.find((i) => i.toLowerCase().includes(arg));
  if (invItem) return [`Just ${invItem}. Nothing more to it, for now.`];
  const nation = getNation(loc.nation);
  if (arg.includes(nation.name.toLowerCase())) return [nation.blurb];
  return generateOpenResponse("examine " + arg, state);
}

function cmdTalk(arg, state) {
  const loc = state.currentLocation();
  const lang = NATION_LANGUAGE[loc.nation] || "vauret";
  const name = generateNameForNation(loc.nation);
  const phraseSet = lang === "vauret" ? DRUID_PHRASES : KETHRAKAR_PHRASES;
  const [phrase, gloss] = phraseSet[Math.floor(Math.random() * phraseSet.length)];
  const lines = [
    `You strike up conversation with a local${arg ? ` about ${arg}` : ""}. They give their name as ${name}.`,
  ];

  if (loc.nation === "kabal" && state.flags.isNovitiate) {
    lines.push(`They clock the registration token before they clock your face. "Novitiate," they say, half a question, half a greeting.`);
  } else if (state.flags.isBruise && (loc.nation === "kabal" || loc.nation === "sanguivorum")) {
    lines.push("Their eyes linger on you a moment too long before the conversation moves on. You keep your conduit out of sight.");
  } else {
    const rep = reputationFor(state, loc.nation);
    if (rep === "friendly") lines.push(`They talk to you like one of their own — because, as far as they're concerned, you are.`);
    else if (rep === "hostile") lines.push(`They answer in clipped, minimal sentences. This conversation is a formality, not a welcome.`);
  }

  if (loc.nation === "vaeloris" || loc.nation === "sanguivorum") {
    lines.push(`They mutter something in the old tongue: "${phrase}" — ${gloss}`);
  } else {
    lines.push(`They mutter something carved-sounding: "${phrase}" — ${gloss}`);
  }
  lines.push(`Then, more practically: "${randomRumor(state)}"`);
  return lines;
}

function randomRumor(state) {
  const rumors = [
    "Careful past the walls after dark. Things that shouldn't still be moving, still move.",
    "Heard tell someone found a piece of something out past the border. A Fragmenta shard, they're calling it. Don't go looking for it, if you've got any sense.",
    "The Kabal's been quiet lately. That's never a good sign.",
    "There's coin to be made hunting for the guilds, if you don't mind the risk.",
    "The old lizardfolk don't let anyone near the deep swamp without an escort. For good reason, they say.",
    "You didn't hear it from me, but the Fingers don't all agree on much these days.",
  ];
  return rumors[Math.floor(Math.random() * rumors.length)];
}

function cmdRest(state) {
  const loc = state.currentLocation();
  if (!loc.services || !loc.services.includes("rest")) {
    return ["There's nowhere safe to rest here. Better to keep moving."];
  }
  state.day += 1;
  const friendly = reputationFor(state, loc.nation) === "friendly";
  const healed = Math.min(state.maxHealth - state.health, friendly ? 12 : 8);
  state.health += healed;
  const lines = [`You rest for a day at ${loc.name}. Recovered ${healed} health.`, `It is now day ${state.day}.`];

  // Vanguard Momentum (Contract Hunter 6pc) persists across fights but
  // decays on rest, approximating its "combat only" wording.
  if (state.flags.vanguardMomentumStacks) {
    state.flags.vanguardMomentumStacks = 0;
    state.recomputeStats(true);
  }

  const hunt = checkKabalHunt(state, state.location);
  if (hunt) {
    lines.push("Rest doesn't mean safety, not for you.");
    lines.push(...hunt);
  }
  return lines;
}

function cmdStatus(state) {
  const loc = state.currentLocation();
  const bg = BACKGROUNDS[state.background];
  const xpLine =
    state.level >= LEVEL_CAP
      ? "XP: max level reached"
      : `XP: ${state.xp}/${xpToNextLevel(state.level)} to next level`;
  const elementLine =
    state.flags.isMage && state.primaryElement
      ? `Element: ${ELEMENTS[state.primaryElement].name}${state.secondaryElement ? ` / ${ELEMENTS[state.secondaryElement].name}` : ""}${state.tertiaryElement ? ` / ${ELEMENTS[state.tertiaryElement].name}` : ""}`
      : null;
  return [
    `${state.playerName} — ${bg ? bg.name : "Wanderer"} — Level ${state.level} — day ${state.day}`,
    `Location: ${loc.name}, ${getNation(loc.nation).name}`,
    `Health: ${state.health}/${state.maxHealth}   Attack: ${state.atk}   Defense: ${state.def}`,
    `Magic: ${state.magic}   Knowledge: ${state.knowledge}`,
    ...(elementLine ? [elementLine] : []),
    xpLine,
    `Gold: ${state.gold}`,
    `Fragmenta shards found: ${state.knownFragments}`,
  ];
}

function cmdReputation(state) {
  const lines = ["== Standing ==", "How officials and locals of each power are likely to treat you.", ""];
  const nations = Object.entries(FACTIONS).filter(([, f]) => f.kind === "nation");
  const guilds = Object.entries(FACTIONS).filter(([, f]) => f.kind === "guild");

  const fmt = (id, f) => {
    const value = state.reputation[id] || 0;
    const sign = value > 0 ? "+" : "";
    return `  ${f.name}: ${sign}${value} (${reputationTier(value)})`;
  };

  lines.push("Nations:");
  nations.forEach(([id, f]) => lines.push(fmt(id, f)));
  lines.push("");
  lines.push("Guilds:");
  guilds.forEach(([id, f]) => lines.push(fmt(id, f)));
  return lines;
}

function cmdSkills(state) {
  if (state.flags.isMage && state.primaryElement) {
    const lines = [
      `== Elemental Abilities == (Knowledge: ${state.knowledge})`,
      `Primary: ${ELEMENTS[state.primaryElement].name}${state.secondaryElement ? `   Secondary: ${ELEMENTS[state.secondaryElement].name}` : ""}${state.tertiaryElement ? `   Tertiary: ${ELEMENTS[state.tertiaryElement].name}` : ""}`,
      "",
    ];
    const elementKeys = [state.primaryElement, state.secondaryElement, state.tertiaryElement].filter(Boolean);
    for (const key of elementKeys) {
      const a = ELEMENT_ABILITIES[key];
      const unlocked = state.knowledge >= a.knowledgeReq;
      const status = unlocked ? "unlocked" : `locked — needs Knowledge ${a.knowledgeReq}`;
      lines.push(`- ${a.name} [${ELEMENTS[key].name}] (${status}): ${a.description}`);
    }
    if (!state.secondaryElement) {
      lines.push("");
      lines.push("A second element opens at level 15, alongside its own ability.");
    } else {
      lines.push("");
      const combo = SYNERGY_COMBOS[pairKey(state.primaryElement, state.secondaryElement)];
      if (combo) {
        lines.push(`Synergy: casting either element right after the other triggers "${combo.name}" — ${combo.message("your target")}`);
      } else {
        lines.push(`Synergy: casting either element right after the other resonates for a +${Math.round((GENERIC_SYNERGY_MULTIPLIER - 1) * 100)}% bonus (no named combo discovered for this pairing yet).`);
      }
    }
    return lines;
  }

  const lines = [`== Tactics == (Knowledge: ${state.knowledge})`];
  for (const [id, t] of Object.entries(TACTICS)) {
    const unlocked = state.knowledge >= t.knowledgeReq;
    const status = unlocked ? "unlocked" : `locked — needs Knowledge ${t.knowledgeReq}`;
    lines.push(`- ${t.name} (${status}): ${t.description}`);
  }
  return lines;
}

function cmdChoose(arg, state) {
  if (state.flags.pendingConduitAscendantChoice) {
    const key = findElement((arg || "").toLowerCase().trim());
    if (!key) return [`Choose a third element to open, beyond ${ELEMENTS[state.primaryElement].name} and ${ELEMENTS[state.secondaryElement].name}: ${elementList().join(", ")}.`];
    if (key === state.primaryElement || key === state.secondaryElement) {
      return ["You've already opened yourself to that element. Choose a different one."];
    }
    state.tertiaryElement = key;
    state.flags.pendingConduitAscendantChoice = false;
    return [`Conduit Ascendant lets you reach further still — you've opened yourself to a third discipline: ${ELEMENTS[key].name}.`];
  }
  if (!state.flags.pendingLevel15Choice) {
    return ["There's nothing to choose right now."];
  }
  const a = (arg || "").toLowerCase().trim();
  if (a === "boost" || a === "primary" || a === "deepen") {
    state.magicBoost = (state.magicBoost || 0) + 6;
    state.recomputeStats(true);
    state.flags.pendingLevel15Choice = false;
    state.flags.level15ChoiceMade = true;
    return [`You turn everything inward. Your command of ${ELEMENTS[state.primaryElement].name} deepens permanently. (+6 Magic)`];
  }
  const key = findElement(a);
  if (!key) {
    return [`Choose 'boost' to deepen your primary element, or a second element: ${elementList().join(", ")}.`];
  }
  if (key === state.primaryElement) {
    return ["That's already your primary element. Choose a different one, or 'boost'."];
  }
  state.secondaryElement = key;
  state.flags.pendingLevel15Choice = false;
  state.flags.level15ChoiceMade = true;
  return [`You've bent your will to a second discipline: ${ELEMENTS[key].name}. Your strikes will now draw from both, unpredictably.`];
}

function codexUnlocked(entry, state) {
  return !entry.requires || !!state.flags[entry.requires];
}

function cmdLore(arg, state) {
  const topics = Object.entries(CODEX)
    .filter(([, entry]) => codexUnlocked(entry, state))
    .map(([key]) => key);

  if (!arg) {
    return ["Codex topics: " + topics.join(", "), "Try: lore <topic>"];
  }
  const key = topics.find((k) => k.includes(arg) || arg.includes(k));
  if (!key) return [`Nothing in the codex about "${arg}" yet. Topics: ${topics.join(", ")}`];
  const entry = CODEX[key];
  return [`== ${entry.title} ==`, entry.text];
}

function describeJobObjective(job) {
  if (job.type === "bounty") return `defeat a sufficiently dangerous creature (tier ${job.tierThreshold}+) anywhere — resolves automatically`;
  if (job.type === "courier") return `reach ${LOCATIONS[job.targetLocation].name} — resolves automatically on arrival`;
  return "";
}

function formatRepReward(repMap) {
  const parts = Object.entries(repMap || {}).map(([fid, amt]) => `${FACTIONS[fid] ? FACTIONS[fid].name : fid} +${amt}`);
  return parts.length ? ` — ${parts.join(", ")}` : "";
}

function cmdQuests(state) {
  const lines = [];
  if (state.activeJobs.length) {
    lines.push("Active work:");
    state.activeJobs.forEach((j) => {
      lines.push(`- ${skullString(j.difficulty)} ${j.title}: ${describeJobObjective(j)}`);
    });
    lines.push("");
  }
  lines.push("Word on the road:");
  for (const q of QUEST_HOOKS) {
    if (q.trigger === "start" || state.flags[q.trigger]) lines.push("- " + q.text);
  }
  return lines;
}

function cmdBoard(state) {
  const loc = state.currentLocation();
  if (!loc.isCity) return ["There's no job board here — try a city."];
  const board = getOrRefreshBoard(state, state.location);
  const lines = [`== Job Board: ${loc.name} ==`];
  if (!board.jobs.length) {
    lines.push("Nothing posted right now. Check back in a few days.");
  } else {
    board.jobs.forEach((j, i) => {
      const tag = j.taken ? " [TAKEN]" : "";
      lines.push(`${i + 1}. ${skullString(j.difficulty)} ${j.title}${tag}`);
      if (!j.taken) {
        lines.push(`   ${j.description}`);
        lines.push(`   Reward: ${j.rewardGold} gold${formatRepReward(j.rewardRep)}${j.loot ? " + possible loot" : ""}`);
      }
    });
    lines.push("(accept <number> to take a job)");
  }
  if (GUILD_HQ[state.location]) {
    lines.push(`This city is also home to a guild — try 'contracts'.`);
  }
  return lines;
}

function cmdContracts(state) {
  const guildId = GUILD_HQ[state.location];
  if (!guildId) return ["No guild keeps contracts here. Try Nocturne (Mugamiir Safor) or Vorseth (Magma-Hearth)."];
  const list = GUILD_CONTRACTS[guildId] || [];
  const lines = [`== ${FACTIONS[guildId].name} — Contracts ==`];
  list.forEach((c, i) => {
    const done = state.flags["completed_" + c.id];
    const active = state.activeJobs.some((j) => j.id === c.id);
    const tag = done ? " [COMPLETED]" : active ? " [SIGNED]" : "";
    lines.push(`${i + 1}. ${skullString(c.difficulty)} ${c.title}${tag}`);
    lines.push(`   ${c.description}`);
    if (!done && !active) lines.push(`   Reward: ${c.rewardGold} gold${formatRepReward(c.rewardRep)} + ${c.loot}`);
  });
  lines.push("(sign <number> to take a contract)");
  return lines;
}

function cmdAccept(arg, state) {
  const loc = state.currentLocation();
  if (!loc.isCity) return ["There's no job board here."];
  const num = parseInt((arg.match(/\d+/) || [])[0], 10);
  if (!num) return ["Accept which job? (accept <number>)"];
  const result = acceptBoardJob(state, state.location, num - 1);
  if (!result.ok) return [result.message];
  return [`Job accepted: ${result.job.title}.`, `Objective: ${describeJobObjective(result.job)}.`];
}

function cmdSign(arg, state) {
  const guildId = GUILD_HQ[state.location];
  if (!guildId) return ["No guild contracts to sign here."];
  const num = parseInt((arg.match(/\d+/) || [])[0], 10);
  if (!num) return ["Sign which contract? (sign <number>)"];
  const result = signGuildContract(state, guildId, num - 1);
  if (!result.ok) return [result.message];
  return [`Contract signed: ${result.job.title}.`, `Objective: ${describeJobObjective(result.job)}.`];
}

function cmdExplore(state) {
  const loc = state.currentLocation();
  const tags = TERRAIN_TAGS[loc.terrain] || ["continental"];

  const hunt = checkKabalHunt(state, state.location);
  if (hunt) return hunt;

  const encounterChance = Math.max(0.05, 0.35 - (state.stealthMod || 0));
  const roll = Math.random();
  if (roll < encounterChance) {
    if (Math.random() < ENEMY_MAGE_CHANCE) {
      return startCombat(state, generateEnemyMage(loc.nation, loc.danger || 1));
    }
    const pool = creaturesForTags(tags, loc.nation).filter((id) => !BESTIARY[id].unique || !state.flags["defeated_" + id]);
    if (pool.length) {
      const creatureId = pool[Math.floor(Math.random() * pool.length)];
      return startCombat(state, creatureId);
    }
  }
  if (roll < 0.55) {
    const gold = Math.floor(Math.random() * 8) + 1;
    state.gold += gold;
    return [`You search the area around ${loc.name} and turn up ${gold} gold someone else lost track of.`, ...state.gainXp(5)];
  }
  if (roll < 0.62 && !state.knownFragments && loc.danger >= 3) {
    state.knownFragments += 1;
    state.flags.hasFragmentMotus = true;
    return [
      "Something in the dirt catches the light wrong. You dig it free: a piece of dull, grey stone, warm to the touch though the ground around it is cold.",
      "It doesn't look like much. You suspect that's the point. (a Fragmenta Motus — the smallest tier, the kind even the gods don't notice)",
    ];
  }
  const flavor = [
    `You look around ${loc.name} a while. Nothing comes of it, but the ${getNation(loc.nation).name} air is instructive, in its way.`,
    `Nothing here but the ordinary business of ${loc.name} going on without you.`,
    `You find a good vantage point and just watch for a time. It's not nothing.`,
  ];
  return [flavor[Math.floor(Math.random() * flavor.length)]];
}

function cmdHelp() {
  return [
    "Commands: look, go <place>, map, inventory, take <item>, drop <item>,",
    "equip <item>, unequip <item>, equipment, examine <thing>, talk [to whom],",
    "rest, status (or level), explore,",
    "lore [topic], quests, reputation, fight, flee, save, help.",
    "You gain XP from kills, jobs, and contracts, and level up automatically",
    "(1-25) — each background grows differently: a fighter's levels favor",
    "attack/defense/health, a mage's favor magic and knowledge.",
    "Work: board (city job board), accept <number>, contracts (guild-only,",
    "at Nocturne/Vorseth), sign <number>. Bounty jobs resolve the moment",
    "you win a big enough fight; courier jobs resolve the moment you arrive.",
    "Tactics: skills (list what Knowledge has unlocked). Fighters/scouts use",
    "feint/decoy/ambush/disarm alongside fight/flee once unlocked. Mages",
    "fight through their chosen element instead, and get their own signature",
    "ability in place of those tactics (ignite/torrent/stoneskin/flurry/",
    "corrode/concuss/blink/windcut — whichever matches your element).",
    "At level 15, mages use 'choose boost' for permanent +Magic, or",
    "'choose <element>' to open a second element and its ability.",
    "You can also just type what you want to do in plain English — the",
    "world will do its best to make sense of it.",
  ];
}
