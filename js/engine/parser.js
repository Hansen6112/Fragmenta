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
  places: ["places", "nearby"],
  inventory: ["inventory", "i", "inv", "items"],
  take: ["take", "get", "grab", "pickup", "pick"],
  drop: ["drop", "discard"],
  equip: ["equip", "wear", "wield"],
  unequip: ["unequip", "unwear", "unwield", "remove"],
  equipment: ["equipment", "gear", "worn"],
  examine: ["examine", "x", "inspect", "study"],
  talk: ["talk", "speak", "ask", "greet"],
  rest: ["rest"],
  sleep: ["sleep", "camp"],
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
  target: ["target", "switch"],
  use: ["use", "drink", "eat", "consume"],
  party: ["party", "allies", "roster"],
  stance: ["stance"],
  recruit: ["recruit"],
  give: ["give", "hand"],
  reclaim: ["reclaim", "retrieve"],
  sanctuary: ["sanctuary", "shrine"],
  pray: ["pray", "offer"],
  rite: ["rite"],
  revive: ["revive", "resurrect"],
  send: ["send", "carry"],
  shop: ["shop", "store", "market"],
  buy: ["buy", "purchase"],
  sell: ["sell"],
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
    if (verb === "target") return useTarget(state, arg);
    if (verb === "use") return useItem(state, arg);
    if (verb === "leave" && getCombatCreature(state).friendly) {
      const name = state.combat.name;
      state.combat = null;
      return [`You leave ${withThe(name, false)} in peace.`];
    }
    if (verb === "talk" && getCombatCreature(state).friendly) {
      state.combat = null;
      const { healed } = applyHeal(state, 6);
      return [
        "It tilts its great bark-covered head toward you. No words — just a sound like creaking wood, structured, patient.",
        `Warmth spreads through a wound you didn't realize still ached. You heal ${healed} health.`,
        ...advanceTime(state, 5, "talk"),
      ];
    }
    if (verb !== "status" && verb !== "look" && verb !== "inventory" && verb !== "equipment" && verb !== "skills" && verb !== "choose" && verb !== "party" && verb !== "stance") {
      const friendly = getCombatCreature(state).friendly;
      const usable = friendly ? [] : availableActionNames(state);
      const options = ["fight", "flee", ...usable, ...(!friendly && aliveEnemies(state).length > 1 ? ["target"] : []), ...(hasUsableConsumable(state) ? ["use"] : []), ...(friendly ? ["talk", "leave"] : [])];
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
    case "places":
      return cmdPlaces(state);
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
    case "sleep":
      return cmdSleep(state);
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
    case "shop":
      return cmdShop(state);
    case "buy":
      return cmdBuy(arg, state);
    case "sell":
      return cmdSell(arg, state);
    case "skills":
      return cmdSkills(state);
    case "choose":
      return cmdChoose(arg, state);
    case "use":
      return useItem(state, arg);
    case "party":
      return cmdParty(state);
    case "stance":
      return cmdStance(arg, state);
    case "recruit":
      return cmdRecruit(arg, state);
    case "give":
      return cmdGive(arg, state);
    case "reclaim":
      return cmdReclaim(arg, state);
    case "sanctuary":
      return cmdSanctuary(state);
    case "pray":
      return cmdPray(state);
    case "rite":
      return cmdAttemptRite(state);
    case "revive":
      return cmdRevive(arg, state);
    case "send":
      return cmdSendAllyHome(arg, state);
    case "leave": {
      const fallen = findDeadAllyPendingChoice(state, arg);
      if (fallen) return cmdLeaveAllyBody(fallen, state);
      return await generateOpenResponse(input, state);
    }
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
  const place = state.currentSublocation();
  const active = place || loc; // whichever place you're actually standing in, for the services/commands hints below
  const lines = place ? [`== ${place.name} ==`, place.description] : [`== ${loc.name} ==`, loc.description];
  if (place) {
    // Scoped to the current place's own district once a city has enough
    // places that "everywhere in the city" stops being a readable list —
    // no district on the current place (rare) falls back to everywhere.
    const siblings = place.district
      ? Object.values(loc.sublocations).filter((s) => s !== place && s.district === place.district)
      : Object.values(loc.sublocations).filter((s) => s !== place);
    lines.push(`Other places in ${place.district || loc.name}: ${siblings.map((s) => s.name).join(", ")}.`);
    lines.push("(go back to return to the square, or 'places' for the full directory)");
  } else {
    const exits = loc.connections.map((c) => LOCATIONS[c.to].name).join(", ");
    lines.push(`Paths from here: ${exits}.`);
    if (loc.sublocations) {
      lines.push("Around the city:");
      groupPlacesByDistrict(Object.values(loc.sublocations)).forEach((g) => lines.push(`  ${g}.`));
    }
  }
  const services = effectiveServices(active);
  if (services.length) {
    lines.push(`Services available: ${services.join(", ")}.`);
  }
  const commands = effectiveCommands(active);
  if (commands.length) {
    lines.push(`Things to do here: ${commands.join(", ")}.`);
  }
  if (state.flags.isBruise && loc.nation === "kabal") {
    lines.push("You are standing in the one place in the world you have the most reason to fear. Every minute here is borrowed.");
  } else {
    const repLine = reputationFlavorLine(state, loc.nation);
    if (repLine) lines.push(repLine);
  }
  if (state.location === KESSA_LOCATION && !state.flags.kessaRecruited) {
    lines.push("A lone mercenary leans against the tavern wall, watching the room like she's pricing everyone in it.");
  }
  return lines;
}

function cmdGo(arg, state) {
  if (!arg) return ["Go where?"];
  const loc = state.currentLocation();

  // Moving between named places within the current city, if it has any
  // (see world.js's sublocations) — a short walk, not a real journey.
  if (loc.sublocations) {
    const subId = findSublocationByName(loc, arg);
    if (subId) {
      if (subId === state.subLocation) return [`You're already at ${loc.sublocations[subId].name}.`];
      state.subLocation = subId;
      return [...cmdLook(state), ...advanceTime(state, 10, "walk")];
    }
    if (state.subLocation && isReturnToSquareQuery(loc, arg)) {
      state.subLocation = null;
      return [...cmdLook(state), ...advanceTime(state, 10, "walk")];
    }
  }

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
      let combatantLevel = null;
      if (Math.random() < ENEMY_MAGE_CHANCE) {
        combatant = generateEnemyMage(legLoc.nation, legDanger);
      } else {
        const tags = TERRAIN_TAGS[legLoc.terrain] || ["continental"];
        const isHostileHere = state.flags.wanted || reputationFor(state, legLoc.nation) === "hostile";
        const pool = creaturesForTags(tags, legLoc.nation)
          .filter((id) => BESTIARY[id].spawnRarity !== "unique" || !state.flags["defeated_" + id])
          .filter((id) => !BESTIARY[id].requiresHostility || isHostileHere);
        if (pool.length) {
          combatantLevel = rollEncounterLevel(state.level);
          const eligiblePool = creaturesEligibleAtLevel(pool, combatantLevel);
          combatant = eligiblePool[Math.floor(Math.random() * eligiblePool.length)];
        }
      }
      if (combatant) {
        lines.push(...advanceTime(state, totalDays * 1440, "travel"));
        state.location = path[i];
        state.subLocation = null; // arriving anywhere always lands at that place's main square/gate
        state.visit(path[i]);
        lines.push(`Along the way, near ${legLoc.name}:`);
        lines.push(...startCombat(state, combatant, combatantLevel));
        return lines;
      }
    }
  }

  lines.push(...advanceTime(state, totalDays * 1440, "travel"));
  state.location = destId;
  state.subLocation = null; // arriving anywhere always lands at that place's main square/gate
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

// A slimmer version of cmdLook's "other places nearby" line, with none of
// the full description — just what's reachable from right here, whether
// that's a city's own sublocations or another city entirely.
// Unlike cmdLook's brief, district-scoped "other places nearby" line,
// 'places' is always the full directory of the current city — grouped by
// district so a city with dozens of sublocations still reads cleanly —
// regardless of which specific spot you're standing in.
function cmdPlaces(state) {
  const loc = state.currentLocation();
  const place = state.currentSublocation();
  const lines = [];
  if (loc.sublocations) {
    lines.push(`Around ${loc.name}:`);
    groupPlacesByDistrict(Object.values(loc.sublocations)).forEach((g) => lines.push(`  ${g}.`));
  }
  const exits = loc.connections.map((c) => LOCATIONS[c.to].name).join(", ");
  lines.push(`Farther afield: ${exits}.`);
  if (place) {
    lines.push("(go back to return to the square)");
  }
  return lines;
}

// Groups a city's sublocations by their `district` tag for readable
// listings at scale — a flat "places: A, B, C, ... (70 names)" line stops
// being readable once a city has more than a handful of places. Entries
// with no district (a quarter's own hub can share its children's district
// string; a rare standalone landmark might have none at all) land in an
// "Other" bucket rather than being silently dropped.
function groupPlacesByDistrict(places) {
  const groups = new Map();
  for (const p of places) {
    const key = p.district || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p.name);
  }
  return Array.from(groups.entries()).map(([district, names]) => `${district}: ${names.join(", ")}`);
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
  if (slot === "consumable") return [`${item} isn't gear — try 'use ${item}' instead.`];
  if (!EQUIP_SLOTS.includes(slot)) return [`${item} isn't gear — it's not something you wear or wield.`];

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

const ALLY_STANCES = ["aggressive", "defensive", "support"];

function findAlly(state, needle) {
  const n = (needle || "").toLowerCase().trim();
  if (!n) return null;
  return state.party.find((a) => a.alive && a.name.toLowerCase().includes(n)) || null;
}

function cmdParty(state) {
  if (!state.party.length) {
    return ["You travel alone for now. (Allies are earned through reputation, quests, and rare finds — none have joined you yet.)"];
  }
  const lines = ["== Party =="];
  for (const ally of state.party) {
    const status = ally.alive ? `${ally.health}/${ally.maxHealth} HP` : "down";
    lines.push(`${ally.name} — Level ${ally.level} — ${status} — Stance: ${ally.stance}`);
    lines.push(`  Attack: ${ally.atk}   Defense: ${ally.def}   Accuracy: ${ally.accuracy}   Agility: ${ally.agility}   Speed: ${ally.speed}`);
    const gearBits = EQUIP_SLOTS.filter((s) => (s === "trinkets" ? ally.equipment.trinkets.length : ally.equipment[s])).map((s) =>
      s === "trinkets" ? ally.equipment.trinkets.map(formatItemLine).join(", ") : formatItemLine(ally.equipment[s])
    );
    lines.push(`  Gear: ${gearBits.length ? gearBits.join("; ") : "(none)"}`);
  }
  lines.push(`(stance <name> ${ALLY_STANCES.join("|")} — give <item> to <name> — reclaim <item> from <name>)`);
  return lines;
}

// Aggressive focuses attack, defensive weakens the enemy, support mends
// whoever's hurting most (see combat.js's resolveAllyActions) — set per
// ally, not party-wide, since a mixed party is the whole point.
function cmdStance(arg, state) {
  if (!state.party.length) return ["You have no allies to command."];
  if (!arg) return [`Set whose stance to what? (${ALLY_STANCES.join("/")}) — try: stance <ally name> <stance>`];
  const words = arg.split(/\s+/);
  const stance = words[words.length - 1];
  if (!ALLY_STANCES.includes(stance)) return [`"${stance}" isn't a stance. Choose one of: ${ALLY_STANCES.join(", ")}.`];
  const nameNeedle = words.slice(0, -1).join(" ").trim();
  const ally = nameNeedle ? findAlly(state, nameNeedle) : state.party.length === 1 ? state.party[0] : null;
  if (!ally) return [nameNeedle ? `No one in your party matches "${nameNeedle}".` : "Whose stance? Name one of your allies."];
  ally.stance = stance;
  return [`${ally.name} shifts to a ${stance} stance.`];
}

// Not the real recruitment path — allies aren't a menu you pick from.
// Each has their own threshold to earn (reputation, a quest, an item —
// see maybeTalkToKessa below for the first one), discovered by playing,
// not by typing this command.
function cmdRecruit() {
  return ["You can't just decide to recruit someone. Word gets around about people worth traveling with — you'll have to find them, and give them a reason to trust you."];
}

// Shared-inventory equip flow for allies — same slot inference/auto-swap
// rules as cmdEquip, just moving the item from state.inventory into the
// named ally's own equipment instead of the player's.
function cmdGive(arg, state) {
  if (!arg) return ["Give what to whom? (try: give <item> to <ally name>)"];
  if (!state.party.length) return ["You have no allies to give anything to."];
  const parts = arg.split(/\s+to\s+/);
  if (parts.length < 2) return ["Give what to whom? (try: give <item> to <ally name>)"];
  const itemNeedle = parts[0].trim();
  const allyNeedle = parts.slice(1).join(" to ").trim();
  const ally = findAlly(state, allyNeedle);
  if (!ally) return [`No one in your party matches "${allyNeedle}".`];
  const idx = state.inventory.findIndex((i) => i.toLowerCase().includes(itemNeedle));
  if (idx < 0) return [`You aren't carrying "${itemNeedle}".`];
  const item = state.inventory[idx];
  const itemDef = getItemDef(item);
  const slot = itemDef ? itemDef.slot : inferEquipSlot(item);
  if (!slot) return [`${item} isn't something ${ally.name} can use.`];
  if (slot === "consumable") return [`${item} isn't gear — it stays in the shared pack for anyone to 'use'.`];
  if (!EQUIP_SLOTS.includes(slot)) return [`${item} isn't gear — it's not something ${ally.name} can wear or wield.`];

  const lines = [];
  if (slot === "trinkets") {
    if (ally.equipment.trinkets.length >= EQUIP_SLOT_CAPACITY.trinkets) {
      return [`${ally.name}'s trinket slots are both full. Reclaim one first.`];
    }
    state.inventory.splice(idx, 1);
    ally.equipment.trinkets.push(item);
    lines.push(`You hand ${formatItemLine(item)} to ${ally.name}. (${EQUIP_SLOT_LABELS.trinkets})`);
  } else {
    const current = ally.equipment[slot];
    if (current) {
      ally.equipment[slot] = null;
      state.inventory.push(current);
      lines.push(`${ally.name} hands back ${current} to make room.`);
    }
    state.inventory.splice(idx, 1);
    ally.equipment[slot] = item;
    lines.push(`You hand ${formatItemLine(item)} to ${ally.name}. (${EQUIP_SLOT_LABELS[slot]})`);
  }
  recomputeAllyStats(ally, ally.level);
  return lines;
}

function cmdReclaim(arg, state) {
  if (!arg) return ["Reclaim what, and from whom? (try: reclaim <item> from <ally name>)"];
  if (!state.party.length) return ["You have no allies to reclaim gear from."];
  const parts = arg.split(/\s+from\s+/);
  const itemNeedle = parts[0].trim();
  const allyNeedle = (parts[1] || "").trim();
  const candidates = allyNeedle ? [findAlly(state, allyNeedle)].filter(Boolean) : state.party.filter((a) => a.alive);
  if (allyNeedle && !candidates.length) return [`No one in your party matches "${allyNeedle}".`];
  for (const ally of candidates) {
    for (const slot of EQUIP_SLOTS) {
      if (slot === "trinkets") {
        const idx = ally.equipment.trinkets.findIndex((i) => i.toLowerCase().includes(itemNeedle));
        if (idx >= 0) {
          const item = ally.equipment.trinkets.splice(idx, 1)[0];
          state.inventory.push(item);
          recomputeAllyStats(ally, ally.level);
          return [`You reclaim ${item} from ${ally.name}.`];
        }
        continue;
      }
      const current = ally.equipment[slot];
      if (current && current.toLowerCase().includes(itemNeedle)) {
        ally.equipment[slot] = null;
        state.inventory.push(current);
        recomputeAllyStats(ally, ally.level);
        return [`You reclaim ${current} from ${ally.name}.`];
      }
    }
  }
  return [`No one in your party has "${itemNeedle}" equipped.`];
}

// ---- Death, the Sanctuary, and revival ----
// An ally who falls in combat (combat.js's killAlly) leaves state.party
// with alive:false and pendingBodyChoice:true — a decision the player
// must resolve before that slot is truly closed. 'send <name> home'
// preserves them at the Sanctuary (state.fallenAllies) for an eventual —
// deliberately not easy — revival; 'leave <name>' lets them go for good.

function findDeadAllyPendingChoice(state, needle) {
  const n = (needle || "").toLowerCase().trim();
  return state.party.find((a) => !a.alive && a.pendingBodyChoice && (!n || a.name.toLowerCase().includes(n))) || null;
}

function cmdSendAllyHome(arg, state) {
  const words = (arg || "").split(/\s+/).filter(Boolean);
  if (words.length && words[words.length - 1] === "home") words.pop();
  const ally = findDeadAllyPendingChoice(state, words.join(" ").trim());
  if (!ally) return ["No one needs sending home right now."];
  ally.pendingBodyChoice = false;
  state.fallenAllies.push({ defId: ally.defId, name: ally.name, level: ally.level, diedDay: state.day });
  state.party = state.party.filter((a) => a !== ally);
  return [
    `You carry ${ally.name}'s body to the Sanctuary and lay them to rest among the others waiting for a second chance.`,
    `(Check on them anytime with 'sanctuary'. Revival needs the Rite of Second Breath, a shard of returning breath, or enough of the god of Death and Renewal's favor.)`,
  ];
}

function cmdLeaveAllyBody(ally, state) {
  ally.pendingBodyChoice = false;
  state.party = state.party.filter((a) => a !== ally);
  return [`You leave ${ally.name} where they fell. Whatever comes next for them, it won't be your doing.`];
}

const DIVINE_FAVOR_REVIVAL_THRESHOLD = 100;
const RITE_OF_SECOND_BREATH_LEVEL_REQ = 12;

function cmdSanctuary(state) {
  const lines = [
    "== The Sanctuary ==",
    "Not a place on any map — wherever the Pantheon's god of Death and Renewal still has any attention left to spare.",
    "",
  ];
  if (!state.fallenAllies.length) {
    lines.push("No one waits here. (Not yet, and hopefully not soon.)");
  } else {
    lines.push("Waiting for a second chance:");
    for (const f of state.fallenAllies) lines.push(`  ${f.name} — fell on day ${f.diedDay}`);
  }
  lines.push("");
  lines.push(`Favor of the god of Death and Renewal: ${state.divineFavor}/${DIVINE_FAVOR_REVIVAL_THRESHOLD} (raise it with 'pray')`);
  lines.push(
    state.flags.riteOfSecondBreathComplete
      ? "The Rite of Second Breath: sworn. Always available."
      : `The Rite of Second Breath: not yet sworn (try 'rite' at level ${RITE_OF_SECOND_BREATH_LEVEL_REQ}+, and something of real worth to surrender).`
  );
  lines.push("A shard of returning breath, if you're carrying one, works here on its own.");
  if (state.fallenAllies.length) lines.push("('revive <name>' when you're ready)");
  return lines;
}

// Raising favor costs more each time — a slow, ordinary devotion, not a
// grind you can brute-force your way through in an afternoon.
function cmdPray(state) {
  const cost = 10 + state.divineFavor;
  if (state.gold < cost) {
    return [`You have nothing left to offer that the god of Death and Renewal would notice. (Praying costs gold — you have ${state.gold}, need ${cost}.)`];
  }
  state.gold -= cost;
  const gain = Math.max(1, Math.round(8 - state.divineFavor / 15));
  state.divineFavor += gain;
  const lines = [`You give what you can and speak the old, unanswerable prayer. Something, somewhere, notices. (+${gain} favor, -${cost} gold)`];
  if (state.divineFavor >= DIVINE_FAVOR_REVIVAL_THRESHOLD && !state.flags.favorThresholdAnnounced) {
    state.flags.favorThresholdAnnounced = true;
    lines.push("For the first time, the prayer actually feels like it reached somewhere. (Your favor alone may now be enough to call someone back — see 'sanctuary'.)");
  }
  return lines;
}

// A one-time, deliberately costly ritual — not a repeatable grind like
// prayer, and not guaranteed by anything you're carrying. Once sworn, it
// stays available for every future revival, no further cost.
function cmdAttemptRite(state) {
  if (state.flags.riteOfSecondBreathComplete) {
    return ["You've already walked the Rite of Second Breath. Its arrangement holds — you may call on it whenever you need to."];
  }
  if (state.level < RITE_OF_SECOND_BREATH_LEVEL_REQ) {
    return [`The Rite of Second Breath isn't something you're ready to survive yet. (needs level ${RITE_OF_SECOND_BREATH_LEVEL_REQ}+; you are ${state.level})`];
  }
  const idx = state.inventory.findIndex((i) => {
    const def = getItemDef(i);
    return def && def.tier >= 3;
  });
  if (idx < 0) return ["The Rite demands something of real worth to surrender — a relic, not a trinket. (needs a tier 3+ item)"];
  const sacrificed = state.inventory.splice(idx, 1)[0];
  state.flags.riteOfSecondBreathComplete = true;
  return [
    `You surrender ${sacrificed} into the dark and speak words that were never meant to be spoken by the living.`,
    "Something answers. Not kindly, not gently, but it answers. The Rite of Second Breath is yours now, for as long as you need it.",
  ];
}

function cmdRevive(arg, state) {
  if (!state.fallenAllies.length) return ["No one is waiting at the Sanctuary."];
  const needle = (arg || "").toLowerCase().trim();
  const idx = needle ? state.fallenAllies.findIndex((a) => a.name.toLowerCase().includes(needle)) : state.fallenAllies.length === 1 ? 0 : -1;
  if (idx < 0) return [needle ? `No one at the Sanctuary matches "${needle}".` : "Revive whom? Name one of the fallen."];
  const fallen = state.fallenAllies[idx];

  let method = null;
  const ritualIdx = state.inventory.findIndex((i) => {
    const def = getItemDef(i);
    return def && def.revives;
  });
  if (state.flags.riteOfSecondBreathComplete) method = "rite";
  else if (ritualIdx >= 0) method = "item";
  else if (state.divineFavor >= DIVINE_FAVOR_REVIVAL_THRESHOLD) method = "favor";

  if (!method) {
    return [
      `${fallen.name} isn't coming back yet. Revival needs one of: the Rite of Second Breath ('rite'), a shard of returning breath, ` +
        `or ${DIVINE_FAVOR_REVIVAL_THRESHOLD} favor with the god of Death and Renewal (currently ${state.divineFavor}, raised with 'pray').`,
    ];
  }
  if (method === "item") state.inventory.splice(ritualIdx, 1);
  else if (method === "favor") state.divineFavor -= DIVINE_FAVOR_REVIVAL_THRESHOLD;
  state.fallenAllies.splice(idx, 1);
  const ally = state.recruitAlly(fallen.defId);

  const lines = [`${fallen.name} draws breath again. It is not a gentle thing to watch.`];
  if (method === "rite") lines.push("The Rite of Second Breath holds true.");
  else if (method === "item") lines.push("The shard of returning breath crumbles to ash, spent.");
  else lines.push(`The god of Death and Renewal's favor is spent. (-${DIVINE_FAVOR_REVIVAL_THRESHOLD} favor)`);
  return ally ? lines : [`Something went wrong bringing ${fallen.name} back.`];
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

// Kessa's recruitment gate: a quest, not a stat check — found at a
// specific location (Arethon, a hub city on the war front, fitting for a
// mercenary passing through), talked to by name, and earned by proving
// yourself in a fight rather than a reputation/item threshold. Meant as
// the first ally and a light, tutorial-weight introduction to the whole
// party mechanic — other allies (Phase 3+) can use reputation or item
// gates instead, per the original design. Returns null (falls through to
// the generic cmdTalk below) unless arg actually references her by name.
const KESSA_LOCATION = "arethon";
function maybeTalkToKessa(arg, state) {
  const a = (arg || "").toLowerCase();
  if (!a.includes("kessa")) return null;
  if (state.party.some((p) => p.defId === "kessa" && p.alive)) {
    return ["Kessa's already at your side. No need to introduce yourselves twice."];
  }
  if (state.location !== KESSA_LOCATION) {
    return ["No one by that name here. (Maybe somewhere with more mercenary traffic passing through.)"];
  }
  if (!state.flags.kessaQuestOffered) {
    state.flags.kessaQuestOffered = true;
    return [
      `A mercenary leans off the tavern wall, watching the room like she's pricing everyone in it. "You've got the look of someone about to get themselves killed for free," she says. "Kessa. I don't work for free, but I'll work for cheap, if you're worth the trouble."`,
      `"Prove it. Clear a real fight without running, and come find me again. Then we'll talk terms."`,
    ];
  }
  if (!state.flags.kessaQuestReady) {
    return [`"Go on, then," Kessa says, unmoved. "I'm not signing on with someone who talks a bigger fight than they can finish."`];
  }
  const ally = state.recruitAlly("kessa");
  state.flags.kessaRecruited = true;
  return [
    `"Fine," Kessa says, pushing off the wall. "You'll do." She falls in step beside you like she's done it a hundred times before.`,
    `${ally.name} joins your party. Set a stance with 'stance kessa aggressive|defensive|support', and gear her up with 'give <item> to kessa'.`,
  ];
}

function cmdTalk(arg, state) {
  const kessaLines = maybeTalkToKessa(arg, state);
  if (kessaLines) return [...kessaLines, ...advanceTime(state, 5, "talk")];
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
  lines.push(...advanceTime(state, 5, "talk"));
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

// True if the player's current physical spot offers `service` — the
// specific sublocation if the city has been broken up into named places
// (see world.js), or the whole city otherwise (every city that hasn't
// been broken up yet keeps working exactly as before).
function hasService(state, service) {
  return effectiveServices(state.currentPlace()).includes(service);
}

// Shared by cmdRest (a quick, 1-hour breather) and cmdSleep (a full
// 8-hour night's rest) — same mechanics, different time cost and heal
// amount. `verb` is just for the opening line's phrasing.
function performRest(state, loc, healAmount, minutes, verb) {
  const { healed } = applyHeal(state, healAmount);
  const lines = [`You ${verb} at ${loc.name}. Recovered ${healed} health.`, ...advanceTime(state, minutes, "rest")];
  lines.push(`Day ${state.day}, ${formatTime(state)} (${getDaypart(state.hour)}).`);

  // Vanguard Momentum (Contract Hunter 6pc) persists across fights but
  // decays on rest, approximating its "combat only" wording.
  if (state.flags.vanguardMomentumStacks) {
    state.flags.vanguardMomentumStacks = 0;
    state.recomputeStats(true);
  }
  // Passing Whisper (Divine Regalia) decays on rest the same way.
  if (state.flags.passingWhisperStacks) {
    state.flags.passingWhisperStacks = 0;
    state.recomputeStats(true);
  }
  // Victor's Momentum (Divine Regalia) decays on rest the same way.
  if (state.flags.victorsMomentumStacks) {
    state.flags.victorsMomentumStacks = 0;
    state.recomputeStats(true);
  }

  const hunt = checkKabalHunt(state, state.location);
  if (hunt) {
    lines.push("Rest doesn't mean safety, not for you.");
    lines.push(...hunt);
  }
  return lines;
}

// The quick option: an hour off your feet, a partial heal, cheap in
// time. 'sleep' (below) is the full 8-hour version.
function cmdRest(state) {
  const loc = state.currentPlace();
  if (!effectiveServices(loc).includes("rest")) {
    return ["There's nowhere safe to rest here. Better to keep moving."];
  }
  return performRest(state, loc, Math.ceil(state.maxHealth * 0.12), 60, "rest a while");
}

// The full option: 8 hours, a full heal — passing maxHealth itself
// (rather than computing the exact deficit) works the same way applyHeal
// already clamps any other heal to maxHealth, and keeps this a genuine
// full heal regardless of whatever healing-boost effects might otherwise
// scale a smaller number past where it should stop.
function cmdSleep(state) {
  const loc = state.currentPlace();
  if (!effectiveServices(loc).includes("rest")) {
    return ["There's nowhere safe to sleep here. Better to keep moving."];
  }
  const wasFatigued = !!fatigueTier(state);
  const lines = performRest(state, loc, state.maxHealth, 480, "sleep through the night");
  state.lastSleptDay = state.day; // the day you WAKE on, after performRest's own advanceTime call
  if (wasFatigued) {
    state.recomputeStats(true);
    lines.push("The exhaustion lifts. You feel like yourself again.");
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
  const fatigue = fatigueTier(state);
  return [
    `${state.playerName} — ${bg ? bg.name : "Wanderer"} — Level ${state.level} — day ${state.day}, ${formatTime(state)} (${getDaypart(state.hour)})`,
    ...(fatigue ? [`Fatigue: ${fatigue.label} (${Math.round((1 - fatigue.mult) * 100)}% stat penalty) — sleep it off.`] : []),
    `Location: ${loc.name}, ${getNation(loc.nation).name}`,
    `Health: ${state.health}/${state.maxHealth}   Attack: ${state.atk}   Defense: ${state.def}`,
    `Magic: ${state.magic}   Knowledge: ${state.knowledge}   Speed: ${state.speed}`,
    `Accuracy: ${state.accuracy}   Agility: ${state.agility}`,
    ...(elementLine ? [elementLine] : []),
    xpLine,
    `Gold: ${state.gold}`,
    `Fragmenta shards found: ${state.knownFragments}`,
    ...(state.party.length ? [`Party: ${state.party.map((a) => a.name).join(", ")}`] : []),
    ...(state.fallenAllies.length ? [`Awaiting revival at the Sanctuary: ${state.fallenAllies.map((a) => a.name).join(", ")}`] : []),
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
  if (state.flags.pendingSoulLedgerChoice) {
    const a = (arg || "").toLowerCase().trim();
    if (a === "health" || a === "hp") {
      state.soulLedgerHealthBonus += 1;
      state.flags.pendingSoulLedgerChoice = false;
      state.recomputeStats(true);
      return [`Soul Ledger — a permanent gift. +1 max Health.`];
    }
    if (a === "magic") {
      state.soulLedgerMagicBonus += 1;
      state.flags.pendingSoulLedgerChoice = false;
      state.recomputeStats(true);
      return [`Soul Ledger — a permanent gift. +1 Magic.`];
    }
    if (a === "defense" || a === "def") {
      state.soulLedgerDefBonus += 1;
      state.flags.pendingSoulLedgerChoice = false;
      state.recomputeStats(true);
      return [`Soul Ledger — a permanent gift. +1 Defense.`];
    }
    return ["Choose 'health', 'magic', or 'defense' for the Soul Ledger's permanent gift."];
  }
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
  if (!hasService(state, "guild")) return ["No guild hall here — you'll need to find the guild's actual seat in this city."];
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
  if (!hasService(state, "guild")) return ["No guild hall here — you'll need to find the guild's actual seat in this city."];
  const num = parseInt((arg.match(/\d+/) || [])[0], 10);
  if (!num) return ["Sign which contract? (sign <number>)"];
  const result = signGuildContract(state, guildId, num - 1);
  if (!result.ok) return [result.message];
  return [`Contract signed: ${result.job.title}.`, `Objective: ${describeJobObjective(result.job)}.`];
}

// Location-gated the same way cmdRest checks loc.services — a shop is
// somewhere you have to actually be, not a menu available from anywhere.
function cmdShop(state) {
  const loc = state.currentPlace();
  if (!effectiveServices(loc).includes("shop")) return ["There's no shop here."];
  if (!isShopOpen(state)) return [`The shop's shuttered for the ${getDaypart(state.hour)}. Try again in the morning.`];
  const shop = getOrRefreshShop(state, state.location);
  const lines = [`== Shop: ${loc.name} ==`];
  if (!shop.stock.length) {
    lines.push("Nothing worth selling here right now. Check back in a few days.");
  } else {
    shop.stock.forEach((item, i) => {
      lines.push(`${i + 1}. ${formatItemLine(item)} — ${shopBuyPrice(item, state)} gold`);
    });
    lines.push("(buy <number> to purchase, sell <item> to sell something from your pack)");
  }
  lines.push(`Gold: ${state.gold}`);
  return lines;
}

function cmdBuy(arg, state) {
  const loc = state.currentPlace();
  if (!effectiveServices(loc).includes("shop")) return ["There's no shop here."];
  if (!isShopOpen(state)) return [`The shop's shuttered for the ${getDaypart(state.hour)}. Try again in the morning.`];
  const num = parseInt((arg.match(/\d+/) || [])[0], 10);
  if (!num) return ["Buy which one? (buy <number> — see 'shop' for the list)"];
  const result = buyShopItem(state, state.location, num - 1);
  if (!result.ok) return [result.message];
  return [`You buy ${formatItemLine(result.item)} for ${result.price} gold. (${state.gold} gold left)`, ...advanceTime(state, 10, "shop")];
}

function cmdSell(arg, state) {
  const loc = state.currentPlace();
  if (!effectiveServices(loc).includes("shop")) return ["There's no shop here to sell to."];
  if (!isShopOpen(state)) return [`The shop's shuttered for the ${getDaypart(state.hour)}. Try again in the morning.`];
  if (!arg) return ["Sell what?"];
  const result = sellInventoryItem(state, arg.toLowerCase());
  if (!result.ok) return [result.message];
  return [`You sell ${formatItemLine(result.item)} for ${result.price} gold. (${state.gold} gold total)`, ...advanceTime(state, 10, "shop")];
}

// Searching an area always costs its own 30 minutes, win lose or draw —
// applied via this wrapper rather than at each of the branches' own
// return statements below, so it can't accidentally be missed on a
// future one. If the search turns up a fight, combat's own time cost
// (see resolveKill/attemptFlee) stacks on top once that fight resolves —
// you spent time searching, then however long the fight itself took.
function cmdExplore(state) {
  return [...exploreOutcome(state), ...advanceTime(state, 30, "explore")];
}

// A sublocation flagged `danger: true` (see world.js — currently used by
// in-city spots like sewers/ruins/smuggling routes rather than a whole
// city) swaps the encounter pool from the city's own terrain tags to the
// "urban" habitat tag instead — bandits, hired blades, and (only when
// the player is actually wanted or locally hostile) a city watch patrol,
// rather than whatever wildlife the city's outdoor terrain would imply.
function exploreOutcome(state) {
  const loc = state.currentLocation();
  const place = state.currentSublocation();
  const urbanDanger = !!(place && place.danger);
  const tags = urbanDanger ? ["urban"] : TERRAIN_TAGS[loc.terrain] || ["continental"];
  const spot = place ? place.name : loc.name;

  const hunt = checkKabalHunt(state, state.location);
  if (hunt) return hunt;

  const encounterChance = Math.max(0.05, (urbanDanger ? 0.4 : 0.35) - (state.stealthMod || 0));
  const roll = Math.random();
  if (roll < encounterChance) {
    if (!urbanDanger && Math.random() < ENEMY_MAGE_CHANCE) {
      return startCombat(state, generateEnemyMage(loc.nation, loc.danger || 1));
    }
    const isHostileHere = state.flags.wanted || reputationFor(state, loc.nation) === "hostile";
    const pool = creaturesForTags(tags, loc.nation)
      .filter((id) => BESTIARY[id].spawnRarity !== "unique" || !state.flags["defeated_" + id])
      .filter((id) => !BESTIARY[id].requiresHostility || isHostileHere);
    if (pool.length) {
      const level = rollEncounterLevel(state.level);
      const eligiblePool = creaturesEligibleAtLevel(pool, level);
      const creatureId = eligiblePool[Math.floor(Math.random() * eligiblePool.length)];
      return startCombat(state, creatureId, level);
    }
  }
  if (roll < 0.55) {
    const gold = Math.floor(Math.random() * 8) + 1;
    state.gold += gold;
    const where = urbanDanger ? spot : `the area around ${spot}`;
    return [`You search ${where} and turn up ${gold} gold someone else lost track of.`, ...state.gainXp(5)];
  }
  if (roll < 0.62 && !state.knownFragments && loc.danger >= 3) {
    state.knownFragments += 1;
    state.flags.hasFragmentMotus = true;
    return [
      "Something in the dirt catches the light wrong. You dig it free: a piece of dull, grey stone, warm to the touch though the ground around it is cold.",
      "It doesn't look like much. You suspect that's the point. (a Fragmenta Motus — the smallest tier, the kind even the gods don't notice)",
    ];
  }
  const flavor = urbanDanger
    ? [
        `You linger in ${spot} a while. Whatever usually happens here, it doesn't happen to you today.`,
        `Nothing comes of it this time — but ${spot} isn't the kind of place that stays quiet for long.`,
        "You keep to the shadows and watch. It's not nothing.",
      ]
    : [
        `You look around ${spot} a while. Nothing comes of it, but the ${getNation(loc.nation).name} air is instructive, in its way.`,
        `Nothing here but the ordinary business of ${spot} going on without you.`,
        "You find a good vantage point and just watch for a time. It's not nothing.",
      ];
  return [flavor[Math.floor(Math.random() * flavor.length)]];
}

function cmdHelp() {
  return [
    "Commands: look, go <place>, map, inventory, take <item>, drop <item>,",
    "equip <item>, unequip <item>, equipment, examine <thing>, talk [to whom],",
    "rest, sleep, status (or level), explore,",
    "lore [topic], quests, reputation, fight, flee, save, help.",
    "Time passes as you act (talking, exploring, buying, fighting, ...) —",
    "status shows the day, clock, and time of day. rest is a quick,",
    "cheap partial heal; sleep is a full night's rest and a full heal.",
    "Go too long without sleeping and fatigue sets in — a stat penalty",
    "that grows daily until you sleep it off. Status shows your fatigue.",
    "You gain XP from kills, jobs, and contracts, and level up automatically",
    "(1-25) — each background grows differently: a fighter's levels favor",
    "attack/defense/health, a mage's favor magic and knowledge.",
    "Work: board (city job board), accept <number>, contracts (guild-only,",
    "at Nocturne/Vorseth), sign <number>. Bounty jobs resolve the moment",
    "you win a big enough fight; courier jobs resolve the moment you arrive.",
    "Shop: shop (view a location's stock, wherever 'services' lists shop),",
    "buy <number>, sell <item>. Stock varies by nation and rotates every",
    "few days, so it's worth checking back. Shops keep morning/afternoon",
    "hours — closed by evening.",
    "Tactics: skills (list what Knowledge has unlocked). Fighters/scouts use",
    "feint/decoy/ambush/disarm alongside fight/flee once unlocked. Mages",
    "fight through their chosen element instead, and get their own signature",
    "ability in place of those tactics (ignite/torrent/stoneskin/flurry/",
    "corrode/concuss/blink/windcut — whichever matches your element).",
    "At level 15, mages use 'choose boost' for permanent +Magic, or",
    "'choose <element>' to open a second element and its ability.",
    "Party: party (view allies), stance <name> aggressive|defensive|support,",
    "give <item> to <name>, reclaim <item> from <name>. Allies act",
    "automatically each round of a fight based on their stance, and death",
    "is a real risk for them in every fight, not just the big ones.",
    "If an ally falls: send <name> home (to the Sanctuary) or leave <name>.",
    "Sanctuary: sanctuary (check on the fallen), pray (raise divine favor),",
    "rite (a one-time, costly path to revival), revive <name>.",
    "You can also just type what you want to do in plain English — the",
    "world will do its best to make sense of it.",
  ];
}
