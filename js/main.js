/*
 * FRAGMENTA — Bootstrap
 */

const logEl = document.getElementById("log");
const invPanel = document.getElementById("inventory-panel");
const equipPanel = document.getElementById("equipment-panel");
const tabButtons = document.querySelectorAll(".tab-btn");
const form = document.getElementById("input-form");
const input = document.getElementById("input");

let state = null;
let activeTab = "story";
let bootStage = "ask_load"; // ask_load -> ask_name -> ask_background -> [ask_element] -> playing
let pendingName = "";
let pendingBgKey = "";

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

function renderActiveTab() {
  if (activeTab === "inventory") renderInventory();
  if (activeTab === "equipment") renderEquipment();
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (gameOver) return;
  const text = input.value;
  if (!text.trim()) return;
  printEcho(text);
  input.value = "";
  input.disabled = true;

  try {
    if (bootStage !== "playing") {
      await handleBootInput(text);
    } else {
      const lines = await handleInput(text, state);
      printLines(lines);
      if (state.health <= 0) {
        print("");
        print("Your journey ends here. Refresh the page to begin again.", "danger");
        gameOver = true;
        return;
      }
    }
  } finally {
    renderActiveTab();
    input.disabled = gameOver;
    if (!gameOver) input.focus();
  }
});

boot();
