/*
 * FRAGMENTA — Bootstrap
 */

const logEl = document.getElementById("log");
const invPanel = document.getElementById("inventory-panel");
const equipPanel = document.getElementById("equipment-panel");
const partyPanel = document.getElementById("party-panel");
const combatMenuEl = document.getElementById("combat-menu");
const shopMenuEl = document.getElementById("shop-menu");
const locationMenuEl = document.getElementById("location-menu");
const tabButtons = document.querySelectorAll(".tab-btn");
const form = document.getElementById("input-form");
const input = document.getElementById("input");
const DEFAULT_INPUT_PLACEHOLDER = input.placeholder;

let state = null;
let activeTab = "story";
let bootStage = "ask_load"; // ask_load -> ask_name -> ask_background -> [ask_element] -> playing
let pendingName = "";
let pendingBgKey = "";
// Menu-driven shop (see engine/shop.js's buildShopMenu). shopMode turns on
// the moment a typed/resolved "shop" command finds an open shop, and stays
// on until Leave Shop is clicked or combat interrupts it. pendingBuy holds
// the one buy option awaiting the "how many?" free-text answer — the only
// approved free-text moment besides naming something.
let shopMode = false;
let pendingBuy = null;

function print(text, cls) {
  const p = document.createElement("p");
  if (cls) p.className = cls;
  p.textContent = text;
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
}

function printLines(lines, cls) {
  lines.forEach((l) => print(l, cls));
}

function printEcho(text) {
  print(text, "echo");
}

// Item names are stored as plain repeated strings (see cmdTake/cmdEquip);
// every item panel aggregates matching names into a count instead of
// listing duplicates as separate rows.
function renderItemList(panel, items, emptyText) {
  panel.innerHTML = "";
  if (!items || items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "inv-empty";
    empty.textContent = emptyText;
    panel.appendChild(empty);
    return;
  }
  const counts = new Map();
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  const list = document.createElement("ul");
  list.className = "inv-list";
  for (const [item, count] of counts) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = formatItemLine(item);
    li.appendChild(name);
    if (count > 1) {
      const badge = document.createElement("span");
      badge.className = "inv-count";
      badge.textContent = `x${count}`;
      li.appendChild(badge);
    }
    list.appendChild(li);
  }
  panel.appendChild(list);
}

function renderInventory() {
  const gold = document.createElement("p");
  gold.className = "inv-gold";
  gold.textContent = `Gold: ${state ? state.gold : 0}`;
  renderItemList(invPanel, state ? state.inventory : [], state ? "You're carrying nothing." : "Your journey hasn't begun yet.");
  invPanel.insertBefore(gold, invPanel.firstChild);
}

// Fixed slot rows (Main Hand, Off Hand, ... Trinkets), unlike the flat
// aggregated inventory list — every slot always shows, empty or not, so
// it reads like a paper doll rather than a bag.
function renderEquipment() {
  equipPanel.innerHTML = "";
  if (!state) {
    const empty = document.createElement("p");
    empty.className = "inv-empty";
    empty.textContent = "Your journey hasn't begun yet.";
    equipPanel.appendChild(empty);
    return;
  }
  const list = document.createElement("ul");
  list.className = "inv-list";
  for (const slot of EQUIP_SLOTS) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.className = "equip-slot-label";
    label.textContent = EQUIP_SLOT_LABELS[slot];
    li.appendChild(label);

    const value = document.createElement("span");
    const filled = slot === "trinkets" ? state.equipment.trinkets : (state.equipment[slot] ? [state.equipment[slot]] : []);
    value.textContent = filled.length ? filled.map(formatItemLine).join("; ") : "(empty)";
    value.className = filled.length ? "equip-slot-value" : "equip-slot-value inv-empty";
    li.appendChild(value);

    list.appendChild(li);
  }
  equipPanel.appendChild(list);

  const setLines = describeSetProgress(state);
  if (setLines.length) {
    const heading = document.createElement("p");
    heading.className = "inv-gold";
    heading.textContent = "Set Bonuses";
    equipPanel.appendChild(heading);
    const setList = document.createElement("ul");
    setList.className = "inv-list";
    for (const line of setLines) {
      const li = document.createElement("li");
      li.textContent = line;
      setList.appendChild(li);
    }
    equipPanel.appendChild(setList);
  }
}

// One card per ally: HP/stats, a stance picker (three buttons, clicking
// one calls setStance the same way the "stance <name> <stance>" typed
// command does), and their currently equipped gear. Re-rendered after
// every input (see the form submit handler), so a stance change made in
// combat via typed command still shows up here immediately.
function renderParty() {
  partyPanel.innerHTML = "";
  if (!state || !state.party.length) {
    const empty = document.createElement("p");
    empty.className = "inv-empty";
    empty.textContent = state ? "You travel alone for now." : "Your journey hasn't begun yet.";
    partyPanel.appendChild(empty);
    return;
  }
  for (const ally of state.party) {
    const card = document.createElement("div");
    card.className = "party-card";

    const name = document.createElement("p");
    name.className = "inv-gold";
    name.textContent = `${ally.name} — Level ${ally.level}`;
    card.appendChild(name);

    const statLine = document.createElement("p");
    statLine.textContent = `${ally.alive ? `${ally.health}/${ally.maxHealth} HP` : "Down"}   Atk ${ally.atk}   Def ${ally.def}   Acc ${ally.accuracy}   Agi ${ally.agility}   Spd ${ally.speed}`;
    card.appendChild(statLine);

    const stanceRow = document.createElement("div");
    stanceRow.className = "party-stance-row";
    ["aggressive", "defensive", "support"].forEach((stance) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = stance;
      btn.className = "party-stance-btn" + (ally.stance === stance ? " active" : "");
      btn.addEventListener("click", () => {
        ally.stance = stance;
        renderParty();
      });
      stanceRow.appendChild(btn);
    });
    card.appendChild(stanceRow);

    const gear = document.createElement("p");
    const gearBits = EQUIP_SLOTS.filter((s) => (s === "trinkets" ? ally.equipment.trinkets.length : ally.equipment[s])).map((s) =>
      s === "trinkets" ? ally.equipment.trinkets.map(formatItemLine).join(", ") : formatItemLine(ally.equipment[s])
    );
    gear.className = gearBits.length ? "equip-slot-value" : "equip-slot-value inv-empty";
    gear.textContent = `Gear: ${gearBits.length ? gearBits.join("; ") : `(none — try 'give <item> to ${ally.name}')`}`;
    card.appendChild(gear);

    partyPanel.appendChild(card);
  }
}

function renderActiveTab() {
  if (activeTab === "inventory") renderInventory();
  if (activeTab === "equipment") renderEquipment();
  if (activeTab === "party") renderParty();
}

// Menu-driven combat (see engine/combat.js's buildCombatMenu): while
// state.combat is active, the typed input is replaced entirely by one
// button per available action — clicking a button runs the exact same
// command string typed input would have accepted. Nothing about
// handleInput/combat.js changes; this only changes how the choice reaches
// it. Re-run after every command (see runCommand's finally block) so the
// button set always reflects the fight's current state.
function renderCombatMenu() {
  const inCombat = bootStage === "playing" && !!(state && state.combat);
  combatMenuEl.hidden = !inCombat;
  form.hidden = inCombat;
  combatMenuEl.innerHTML = "";
  if (!inCombat) return;
  buildCombatMenu(state).forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "combat-menu-btn" + (opt.command === "flee" ? " flee" : "");
    btn.textContent = opt.label;
    btn.addEventListener("click", () => runCommand(opt.command, opt.label));
    combatMenuEl.appendChild(btn);
  });
}

// Menu-driven shop (see engine/shop.js's buildShopMenu). Buy/Sell buttons
// call buyShopItem/sellInventoryItem directly rather than round-tripping
// through a typed command string — the same direct-state-mutation pattern
// renderParty()'s own stance buttons already use above. Combat always
// takes priority for the input surface: if a fight starts while shopping
// (shouldn't normally happen, but nothing currently prevents it), shop
// mode just silently drops rather than fighting renderCombatMenu for the
// same form.hidden toggle.
function renderShopMenu() {
  const inCombat = bootStage === "playing" && !!(state && state.combat);
  if (inCombat) {
    shopMode = false;
    pendingBuy = null;
    shopMenuEl.hidden = true;
    shopMenuEl.innerHTML = "";
    return;
  }

  const inShop = bootStage === "playing" && shopMode;
  shopMenuEl.hidden = !inShop;
  shopMenuEl.innerHTML = "";
  if (!inShop) {
    form.hidden = false;
    input.placeholder = DEFAULT_INPUT_PLACEHOLDER;
    return;
  }

  const menu = buildShopMenu(state);
  if (!menu) {
    // The shop closed or became unavailable mid-session (e.g. the clock
    // ticked past closing time) — drop out of shop mode entirely.
    shopMode = false;
    pendingBuy = null;
    shopMenuEl.hidden = true;
    form.hidden = false;
    input.placeholder = DEFAULT_INPUT_PLACEHOLDER;
    print("The shop's closed up for now.", "system");
    return;
  }

  if (pendingBuy) {
    form.hidden = false;
    const prompt = document.createElement("p");
    prompt.className = "shop-heading";
    prompt.textContent = `How many ${pendingBuy.item}? (up to ${pendingBuy.remaining}, ${pendingBuy.price} gold each)`;
    shopMenuEl.appendChild(prompt);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "combat-menu-btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      pendingBuy = null;
      renderModals();
    });
    shopMenuEl.appendChild(cancel);
    input.placeholder = `how many? (1-${pendingBuy.remaining})`;
    return;
  }

  form.hidden = true;
  input.placeholder = DEFAULT_INPUT_PLACEHOLDER;
  const heading = document.createElement("p");
  heading.className = "shop-heading";
  heading.textContent = `${menu.locName} — Gold: ${menu.gold}`;
  shopMenuEl.appendChild(heading);

  menu.buyOptions.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "combat-menu-btn";
    btn.textContent = opt.label;
    btn.disabled = opt.remaining <= 0;
    btn.addEventListener("click", () => {
      if (opt.remaining > 1) {
        pendingBuy = opt;
        renderModals();
      } else {
        resolveBuy(opt.index, 1);
      }
    });
    shopMenuEl.appendChild(btn);
  });

  menu.sellOptions.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "combat-menu-btn";
    btn.textContent = opt.label;
    btn.addEventListener("click", () => resolveSell(opt.item));
    shopMenuEl.appendChild(btn);
  });

  const leave = document.createElement("button");
  leave.type = "button";
  leave.className = "combat-menu-btn flee";
  leave.textContent = "Leave Shop";
  leave.addEventListener("click", () => {
    shopMode = false;
    print("You step away from the counter.", "system");
    renderModals();
  });
  shopMenuEl.appendChild(leave);
}

// Menu-driven base actions (see engine/parser.js's buildLocationMenu) —
// travel/explore/talk/rest/sleep/heal/shop-entry as buttons. Unlike
// combat/shop, this is ADDITIVE: it never touches form.hidden or
// input.disabled itself, since plenty of systems (equip, quests,
// sanctuary, tactics, give/reclaim, save, ...) have no menu equivalent
// yet and still need the typed input reachable underneath. Hidden
// entirely whenever combat or the shop menu has taken the input over.
function renderLocationMenu() {
  const show = bootStage === "playing" && !!state && !state.combat && !shopMode;
  locationMenuEl.hidden = !show;
  locationMenuEl.innerHTML = "";
  if (!show) return;
  buildLocationMenu(state).forEach((opt) => {
    if (opt.heading) {
      const h = document.createElement("p");
      h.className = "shop-heading";
      h.textContent = opt.heading;
      locationMenuEl.appendChild(h);
      return;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "combat-menu-btn";
    btn.textContent = opt.label;
    btn.addEventListener("click", () => runCommand(opt.command, opt.label));
    locationMenuEl.appendChild(btn);
  });
}

// Single call site for every modal render + input-enable sync, so no
// caller can update one without the others (renderShopMenu leaving shop
// mode, say, without also bringing renderLocationMenu back).
function renderModals() {
  renderCombatMenu();
  renderShopMenu();
  renderLocationMenu();
  syncInputEnabled();
}

// Whether the input box should currently be off-limits to typing — true
// during combat, and true while shop buttons are showing (but NOT while
// pendingBuy's quantity prompt is up, which is the one approved moment).
function inputBlocked() {
  const inCombat = bootStage === "playing" && !!(state && state.combat);
  const inShopMenu = bootStage === "playing" && shopMode && !pendingBuy;
  return inCombat || inShopMenu;
}

// Every button handler that isn't routed through runCommand (combat's own
// buttons are — shop's aren't, per renderShopMenu's header comment) still
// has to leave the input box in the right enabled/focused state
// afterward, exactly like runCommand's own finally block does.
function syncInputEnabled() {
  const blocked = inputBlocked();
  input.disabled = gameOver || blocked;
  if (!gameOver && !blocked) input.focus();
}

function resolveBuy(index, qty) {
  if (gameOver) return;
  const result = buyShopItem(state, state.location, index, qty);
  if (result.ok) {
    const label = result.qty > 1 ? `${result.qty}x ${formatItemLine(result.item)}` : formatItemLine(result.item);
    print(`You buy ${label} for ${result.price} gold. (${state.gold} gold left)`);
    printLines(advanceTime(state, 10, "shop"));
  } else {
    print(result.message, "system");
  }
  renderActiveTab();
  renderModals();
}

function resolveSell(item) {
  if (gameOver) return;
  const result = sellInventoryItem(state, item.toLowerCase());
  if (result.ok) {
    print(`You sell ${formatItemLine(result.item)} for ${result.price} gold. (${state.gold} gold total)`);
    printLines(advanceTime(state, 10, "shop"));
  } else {
    print(result.message, "system");
  }
  renderActiveTab();
  renderModals();
}

function switchTab(tab) {
  activeTab = tab;
  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  logEl.hidden = tab !== "story";
  invPanel.hidden = tab !== "inventory";
  equipPanel.hidden = tab !== "equipment";
  partyPanel.hidden = tab !== "party";
  renderActiveTab();
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function boot() {
  print("FRAGMENTA", "title");
  print("a world, shattered", "system");
  print("");
  if (GameState.hasSave()) {
    bootStage = "ask_load";
    print("A previous journey was found. Continue it? (yes/no)", "system");
  } else {
    startNewGame();
  }
}

function startNewGame() {
  bootStage = "ask_name";
  print("Before the road, a name. What shall we call you?", "system");
}

function beginCharacter(bgKey, name, elementKey) {
  state = new GameState();
  state.playerName = name;
  state.applyBackground(bgKey);
  if (elementKey) state.primaryElement = elementKey;
  state.visit(state.location);
  bootStage = "playing";

  printLines(INTRO_TEXT.split("\n\n"));
  print("");
  print(BACKGROUNDS[bgKey].intro);
  if (elementKey) {
    print("");
    print(`Your magic has always leaned one way: ${ELEMENTS[elementKey].name}. ${ELEMENTS[elementKey].description}`);
  }
  print("");
  printLines(cmdLook(state));
  print("");
  print("(type 'help' any time to see what you can do, or 'status' to see your character)", "system");
}

async function handleBootInput(raw) {
  const text = raw.trim();
  if (bootStage === "ask_load") {
    if (/^y/i.test(text)) {
      state = GameState.load();
      if (state) {
        bootStage = "playing";
        print(`Welcome back, ${state.playerName}. Day ${state.day}.`, "system");
        printLines(cmdLook(state));
        return;
      }
      print("No valid save found. Starting fresh.", "system");
    }
    startNewGame();
    return;
  }
  if (bootStage === "ask_name") {
    pendingName = text || "Wanderer";
    bootStage = "ask_background";
    print(`Well met, ${pendingName}.`, "system");
    print("");
    print("Before the road, who were you? Choose where your story begins:", "system");
    Object.entries(BACKGROUNDS).forEach(([key, bg], i) => {
      print(`  ${i + 1}. ${bg.name} — ${bg.tagline}`, "system");
    });
    print("(type a number, or a name)", "system");
    return;
  }
  if (bootStage === "ask_background") {
    const keys = Object.keys(BACKGROUNDS);
    const asNumber = parseInt(text, 10);
    let key = null;
    if (!isNaN(asNumber) && keys[asNumber - 1]) {
      key = keys[asNumber - 1];
    } else {
      const t = text.toLowerCase();
      key = keys.find((k) => t.includes(k) || k.includes(t) || BACKGROUNDS[k].name.toLowerCase().includes(t));
    }
    if (!key) {
      print(`Not a background anyone's heard of. Try a number (1-${keys.length}) or a name.`, "system");
      return;
    }
    if (BACKGROUNDS[key].flags && BACKGROUNDS[key].flags.isMage) {
      pendingBgKey = key;
      bootStage = "ask_element";
      print(`Before anything else — what has your magic always leaned toward?`, "system");
      Object.values(ELEMENTS).forEach((el, i) => {
        print(`  ${i + 1}. ${el.name} — ${el.description}`, "system");
      });
      print("(type a number, or a name — you can open a second element later, at level 15)", "system");
      return;
    }
    beginCharacter(key, pendingName);
    return;
  }
  if (bootStage === "ask_element") {
    const keys = Object.keys(ELEMENTS);
    const asNumber = parseInt(text, 10);
    let key = null;
    if (!isNaN(asNumber) && keys[asNumber - 1]) {
      key = keys[asNumber - 1];
    } else {
      key = findElement(text);
    }
    if (!key) {
      print(`Not an element anyone's ever channeled. Try a number (1-${keys.length}) or a name.`, "system");
      return;
    }
    beginCharacter(pendingBgKey, pendingName, key);
    return;
  }
}

let gameOver = false;

// Shared by both the typed-input form and every combat menu button —
// `echoText` lets a button echo its human label ("Fight") while sending
// combat.js's actual command string ("fight") to handleInput underneath.
async function runCommand(commandText, echoText) {
  if (gameOver) return;
  printEcho(echoText != null ? echoText : commandText);
  input.value = "";
  input.disabled = true;

  try {
    if (bootStage !== "playing") {
      await handleBootInput(commandText);
    } else {
      // Detect "shop" (or a synonym — "store"/"market") the same way
      // handleInput itself resolves the verb, so entering shop mode
      // matches exactly whatever cmdShop was actually about to do.
      const words = commandText.trim().toLowerCase().split(/\s+/);
      const verb = resolveVerb(words[0], words.length === 1);
      const lines = await handleInput(commandText, state);
      printLines(lines);
      if (verb === "shop" && !state.combat && buildShopMenu(state)) {
        shopMode = true;
      }
      if (state.health <= 0) {
        print("");
        print("Your journey ends here. Refresh the page to begin again.", "danger");
        gameOver = true;
        return;
      }
    }
  } finally {
    renderActiveTab();
    renderModals();
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value;
  if (!text.trim()) return;
  if (pendingBuy) {
    const buy = pendingBuy;
    const n = parseInt(text.trim(), 10);
    printEcho(text);
    input.value = "";
    pendingBuy = null;
    if (!n || n < 1) {
      print(`"${text}" isn't a valid quantity.`, "system");
      renderModals();
      return;
    }
    resolveBuy(buy.index, n);
    return;
  }
  await runCommand(text);
});

boot();
