/*
 * FRAGMENTA — Bootstrap
 */

const logEl = document.getElementById("log");
const invPanel = document.getElementById("inventory-panel");
const equipPanel = document.getElementById("equipment-panel");
const partyPanel = document.getElementById("party-panel");
const combatMenuEl = document.getElementById("combat-menu");
const shopMenuEl = document.getElementById("shop-menu");
const jobMenuEl = document.getElementById("job-menu");
const choiceMenuEl = document.getElementById("choice-menu");
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
// Menu-driven job board/guild contracts (see engine/jobs.js's
// buildJobsMenu) — same on/off shape as shopMode, entered by a typed/
// resolved "board" or "contracts" command finding either available.
let jobMode = false;
// Which combat sub-menu is currently showing (see engine/combat.js's
// buildCombatMenu): null is the top-level Fight/Use Item/Flee choice;
// "target"/"attack"/"item" are the drill-downs Fight and Use Item open
// into. Reset to null (renderCombatMenu) the moment combat ends, so the
// next fight always starts back at the top.
let combatStage = null;

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
// listing duplicates as separate rows. `actionsForItem`, when given,
// appends one button per {label, command} it returns for that item —
// clicking one runs the exact command string equip/unequip/drop/give/use
// already accept from typed input (same command-string reuse as combat's
// buildCombatMenu), so no parser changes were needed for this phase.
function renderItemList(panel, items, emptyText, actionsForItem) {
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
    li.className = "inv-row";
    const row = document.createElement("div");
    row.className = "inv-row-main";
    const name = document.createElement("span");
    name.textContent = formatItemLine(item);
    row.appendChild(name);
    if (count > 1) {
      const badge = document.createElement("span");
      badge.className = "inv-count";
      badge.textContent = `x${count}`;
      row.appendChild(badge);
    }
    li.appendChild(row);
    const actions = actionsForItem ? actionsForItem(item) : [];
    if (actions.length) {
      const actionRow = document.createElement("div");
      actionRow.className = "inv-actions";
      actions.forEach((a) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "combat-menu-btn";
        btn.textContent = a.label;
        btn.addEventListener("click", () => runCommand(a.command, a.label));
        actionRow.appendChild(btn);
      });
      li.appendChild(actionRow);
    }
    list.appendChild(li);
  }
  panel.appendChild(list);
}

// Equip is only offered for real gear (cmdEquip rejects consumable/
// ritual slots the same way); Give mirrors cmdGive's own "consumables
// stay in the shared pack" rule, so it only appears alongside Equip too.
// Drop always applies.
function actionsForInventoryItem(item) {
  const actions = [];
  const def = getItemDef(item);
  const slot = def ? def.slot : inferEquipSlot(item);
  if (slot === "consumable") {
    actions.push({ label: "Use", command: `use ${item}` });
  } else if (slot && EQUIP_SLOTS.includes(slot)) {
    actions.push({ label: "Equip", command: `equip ${item}` });
    state.party.filter((a) => a.alive).forEach((a) => {
      actions.push({ label: `Give: ${a.name}`, command: `give ${item} to ${a.name}` });
    });
  }
  actions.push({ label: "Drop", command: `drop ${item}` });
  return actions;
}

function renderInventory() {
  const gold = document.createElement("p");
  gold.className = "inv-gold";
  gold.textContent = `Gold: ${state ? state.gold : 0}`;
  renderItemList(
    invPanel,
    state ? state.inventory : [],
    state ? "You're carrying nothing." : "Your journey hasn't begun yet.",
    state ? actionsForInventoryItem : null
  );
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
    li.className = "inv-row";
    const row = document.createElement("div");
    row.className = "inv-row-main";
    const label = document.createElement("span");
    label.className = "equip-slot-label";
    label.textContent = EQUIP_SLOT_LABELS[slot];
    row.appendChild(label);

    const value = document.createElement("span");
    const filled = slot === "trinkets" ? state.equipment.trinkets : (state.equipment[slot] ? [state.equipment[slot]] : []);
    value.textContent = filled.length ? filled.map(formatItemLine).join("; ") : "(empty)";
    value.className = filled.length ? "equip-slot-value" : "equip-slot-value inv-empty";
    row.appendChild(value);
    li.appendChild(row);

    if (filled.length) {
      const actionRow = document.createElement("div");
      actionRow.className = "inv-actions";
      filled.forEach((item) => {
        const label = filled.length > 1 ? `Unequip: ${item}` : "Unequip";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "combat-menu-btn";
        btn.textContent = label;
        btn.addEventListener("click", () => runCommand(`unequip ${item}`, label));
        actionRow.appendChild(btn);
      });
      li.appendChild(actionRow);
    }

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
  if (!state) {
    const empty = document.createElement("p");
    empty.className = "inv-empty";
    empty.textContent = "Your journey hasn't begun yet.";
    partyPanel.appendChild(empty);
    return;
  }
  if (!state.party.length) {
    const empty = document.createElement("p");
    empty.className = "inv-empty";
    empty.textContent = "You travel alone for now.";
    partyPanel.appendChild(empty);
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

    // A fallen ally still sits in state.party (see killAlly) until this
    // choice is made — send-home/leave takes over from the stance row,
    // which means nothing for someone no longer standing.
    if (!ally.alive && ally.pendingBodyChoice) {
      const notice = document.createElement("p");
      notice.className = "equip-slot-value inv-empty";
      notice.textContent = "Awaiting your decision — send them to the Sanctuary, or leave them where they fell.";
      card.appendChild(notice);

      const choiceRow = document.createElement("div");
      choiceRow.className = "party-stance-row";
      const sendBtn = document.createElement("button");
      sendBtn.type = "button";
      sendBtn.className = "combat-menu-btn";
      sendBtn.textContent = "Send Home";
      sendBtn.addEventListener("click", () => runCommand(`send ${ally.name} home`, `Send Home: ${ally.name}`));
      choiceRow.appendChild(sendBtn);
      const leaveBtn = document.createElement("button");
      leaveBtn.type = "button";
      leaveBtn.className = "combat-menu-btn flee";
      leaveBtn.textContent = "Leave";
      leaveBtn.addEventListener("click", () => runCommand(`leave ${ally.name}`, `Leave: ${ally.name}`));
      choiceRow.appendChild(leaveBtn);
      card.appendChild(choiceRow);

      partyPanel.appendChild(card);
      continue;
    }

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

  renderSanctuarySection();
}

// The Sanctuary is location-agnostic (cmdSanctuary's own "not a place on
// any map"), so — unlike Rest/Shop/Jobs on the location menu — this isn't
// gated by where the player is standing; it lives permanently at the
// bottom of the Party tab instead, alongside the fallen allies it exists
// for. Uses buildSanctuaryInfo (parser.js) for the same disabled-when-
// unavailable treatment as shop's sold-out items and the job board's
// already-taken postings.
function renderSanctuarySection() {
  const info = buildSanctuaryInfo(state);

  const heading = document.createElement("p");
  heading.className = "inv-gold";
  heading.textContent = "The Sanctuary";
  partyPanel.appendChild(heading);

  const favorLine = document.createElement("p");
  favorLine.textContent = `Favor of the god of Death and Renewal: ${info.divineFavor}/${info.favorThreshold}`;
  partyPanel.appendChild(favorLine);

  const riteLine = document.createElement("p");
  riteLine.className = "equip-slot-value inv-empty";
  riteLine.textContent = info.riteComplete
    ? "The Rite of Second Breath: sworn. Always available."
    : `The Rite of Second Breath: not yet sworn (level ${info.riteLevelReq}+, and a tier 3+ item to surrender).`;
  partyPanel.appendChild(riteLine);

  const actionRow = document.createElement("div");
  actionRow.className = "inv-actions";
  const prayBtn = document.createElement("button");
  prayBtn.type = "button";
  prayBtn.className = "combat-menu-btn";
  prayBtn.textContent = "Pray";
  prayBtn.addEventListener("click", () => runCommand("pray", "Pray"));
  actionRow.appendChild(prayBtn);
  if (!info.riteComplete) {
    const riteBtn = document.createElement("button");
    riteBtn.type = "button";
    riteBtn.className = "combat-menu-btn";
    riteBtn.textContent = "Attempt the Rite";
    riteBtn.disabled = !info.canAttemptRite;
    riteBtn.addEventListener("click", () => runCommand("rite", "Attempt the Rite"));
    actionRow.appendChild(riteBtn);
  }
  partyPanel.appendChild(actionRow);

  if (info.fallenAllies.length) {
    const fallenHeading = document.createElement("p");
    fallenHeading.className = "inv-gold";
    fallenHeading.textContent = "Waiting for a second chance";
    partyPanel.appendChild(fallenHeading);
    info.fallenAllies.forEach((f) => {
      const card = document.createElement("div");
      card.className = "party-card";
      const line = document.createElement("p");
      line.textContent = `${f.name} — fell on day ${f.diedDay}`;
      card.appendChild(line);
      const reviveBtn = document.createElement("button");
      reviveBtn.type = "button";
      reviveBtn.className = "combat-menu-btn";
      reviveBtn.textContent = "Revive";
      reviveBtn.disabled = !info.hasRevivalMethod;
      reviveBtn.addEventListener("click", () => runCommand(`revive ${f.name}`, `Revive: ${f.name}`));
      card.appendChild(reviveBtn);
      partyPanel.appendChild(card);
    });
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
  // These takeover/additive menus are DOM siblings of the tab panels, not
  // children of the Story log itself — so without the activeTab check they
  // stay visible (and, for combat/shop/job, fully clickable) underneath
  // Inventory/Equipment/Party too, floating below whatever that tab shows.
  combatMenuEl.hidden = !inCombat || activeTab !== "story";
  combatMenuEl.innerHTML = "";
  if (!inCombat) {
    combatStage = null;
    return;
  }

  const creature = getCombatCreature(state);
  const stage = creature.friendly ? "top" : combatStage || "top";
  buildCombatMenu(state, stage).forEach((opt) => {
    // A pending choice (buildChoiceMenu) can be prepended here with its
    // own {heading} divider — same handling as the shop/job/location
    // menus already give one.
    if (opt.heading) {
      const h = document.createElement("p");
      h.className = "shop-heading";
      h.textContent = opt.heading;
      combatMenuEl.appendChild(h);
      return;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "combat-menu-btn" + (opt.command === "flee" ? " flee" : "");
    btn.textContent = opt.label;
    if (opt.disabled) {
      btn.disabled = true;
    } else {
      btn.addEventListener("click", async () => {
        // opt.command (a real command string) is optional here — Fight and
        // Use Item at the top level are pure navigation into a sub-menu,
        // nothing for handleInput to run yet. Anything with a command runs
        // it exactly as typed input would, same as every other menu in the
        // game; opt.nextStage then says where the menu lands afterward
        // (explicit for target-picking, which advances to "attack" instead
        // of resolving a round — everything else defaults back to "top").
        if (opt.command) await runCommand(opt.command, opt.label);
        combatStage = opt.nextStage !== undefined ? opt.nextStage : null;
        renderModals();
      });
    }
    combatMenuEl.appendChild(btn);
  });

  // Sub-stages get a Back button — pure UI navigation, not a real command,
  // so (like the shop's pendingBuy Cancel button) it's added here rather
  // than returned from buildCombatMenu itself.
  if (stage !== "top") {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "combat-menu-btn";
    back.textContent = "Back";
    back.addEventListener("click", () => {
      combatStage = stage === "attack" && aliveEnemies(state).length > 1 ? "target" : null;
      renderModals();
    });
    combatMenuEl.appendChild(back);
  }
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
  shopMenuEl.hidden = !inShop || activeTab !== "story";
  shopMenuEl.innerHTML = "";
  if (!inShop) {
    return;
  }

  const menu = buildShopMenu(state);
  if (!menu) {
    // The shop closed or became unavailable mid-session (e.g. the clock
    // ticked past closing time) — drop out of shop mode entirely.
    shopMode = false;
    pendingBuy = null;
    shopMenuEl.hidden = true;
    print("The shop's closed up for now.", "system");
    return;
  }

  if (pendingBuy) {
    const prompt = document.createElement("p");
    prompt.className = "shop-heading";
    // Item names are stored with their own leading article ("a traveler's
    // healing draught"), so "How many <item>?" reads wrong — put the item
    // first as its own (capitalized) clause instead.
    prompt.textContent = `${capitalize(pendingBuy.item)} — how many? (up to ${pendingBuy.remaining}, ${pendingBuy.price} gold each)`;
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
    return;
  }

  shopMenuEl.classList.add("menu-modal");

  // A big stock plus a long-owned inventory can easily outgrow the
  // screen (a full gear+potion shop against 25+ distinct owned items
  // runs past 1500px tall with nowhere capped) — everything scrollable
  // lives in its own capped box, with Leave Shop rendered OUTSIDE it so
  // it's never buried regardless of how long Buy/Sell get.
  const scrollBox = document.createElement("div");
  scrollBox.className = "menu-scroll-box";
  shopMenuEl.appendChild(scrollBox);

  const heading = document.createElement("p");
  heading.className = "shop-heading";
  heading.textContent = `${menu.locName} — Gold: ${menu.gold}`;
  scrollBox.appendChild(heading);

  // One collapsible section per category (Weapons/Armor/Potions/Jewelry
  // — shop.js's buildShopMenu groups these) rather than one flat "Buy"
  // list: browsing means picking a type first, then seeing just that
  // type's items, instead of scanning every item the shop has at once.
  // Defaults collapsed, unlike Sell below — there's no single "the buy
  // list" a player would want open by default the way there is for
  // "what can I sell right now."
  const buildBuyBtn = (opt) => {
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
    return btn;
  };
  menu.buyCategories.forEach((cat) => {
    appendCollapsibleSection(scrollBox, `shop:buy:${cat.id}`, `${cat.label} (${cat.options.length})`, cat.options, buildBuyBtn, true);
  });

  appendCollapsibleSection(scrollBox, "shop:sell", `Sell (${menu.sellOptions.length})`, menu.sellOptions, (opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "combat-menu-btn";
    btn.textContent = opt.label;
    btn.addEventListener("click", () => resolveSell(opt.item));
    return btn;
  });

  const leave = document.createElement("button");
  leave.type = "button";
  leave.className = "combat-menu-btn flee menu-pinned-btn";
  leave.textContent = "Leave Shop";
  leave.addEventListener("click", () => {
    shopMode = false;
    print("You step away from the counter.", "system");
    renderModals();
  });
  shopMenuEl.appendChild(leave);
}

// Menu-driven job board/guild contracts (see engine/jobs.js's
// buildJobsMenu) — same modal-takeover shape as renderShopMenu, just
// without a quantity-prompt step: Accept/Sign always take exactly one.
function renderJobMenu() {
  const inCombat = bootStage === "playing" && !!(state && state.combat);
  if (inCombat) {
    jobMode = false;
    jobMenuEl.hidden = true;
    jobMenuEl.innerHTML = "";
    return;
  }

  const inJobs = bootStage === "playing" && jobMode;
  jobMenuEl.hidden = !inJobs || activeTab !== "story";
  jobMenuEl.innerHTML = "";
  if (!inJobs) {
    return;
  }

  const options = buildJobsMenu(state);
  if (!options) {
    jobMode = false;
    jobMenuEl.hidden = true;
    print("There's nothing to post or sign here anymore.", "system");
    return;
  }

  jobMenuEl.classList.add("menu-modal");

  // Small and fixed today (a city's board is always 3 jobs, a guild's
  // contract list a handful more), but the same overflow the shop hit —
  // an ever-growing sell list with no scroll cap at all, burying Leave
  // ~1000px down — has nothing to do with today's content size and
  // everything to do with this shape never getting revisited once new
  // job types or a second board eventually get added. Same fix applied
  // pre-emptively rather than waiting to rediscover it.
  const scrollBox = document.createElement("div");
  scrollBox.className = "menu-scroll-box";
  jobMenuEl.appendChild(scrollBox);

  let hiddenSectionId = null;
  options.forEach((opt) => {
    if (opt.heading) {
      const collapsed = isSectionCollapsed(opt);
      hiddenSectionId = collapsed ? opt.id : null;
      const h = document.createElement("p");
      h.className = "shop-heading location-heading";
      h.textContent = `${collapsed ? "▸" : "▾"} ${opt.heading}`;
      h.addEventListener("click", () => {
        if (collapsedOverrides.has(opt.id)) collapsedOverrides.delete(opt.id);
        else collapsedOverrides.add(opt.id);
        renderModals();
      });
      scrollBox.appendChild(h);
      return;
    }
    if (hiddenSectionId) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "combat-menu-btn";
    btn.textContent = opt.label;
    if (opt.disabled) {
      btn.disabled = true;
    } else {
      btn.addEventListener("click", () => runCommand(opt.command, opt.label));
    }
    scrollBox.appendChild(btn);
  });

  const leave = document.createElement("button");
  leave.type = "button";
  leave.className = "combat-menu-btn flee menu-pinned-btn";
  leave.textContent = "Leave";
  leave.addEventListener("click", () => {
    jobMode = false;
    print("You step away from the board.", "system");
    renderModals();
  });
  jobMenuEl.appendChild(leave);
}

// Menu-driven one-time choices (see engine/parser.js's buildChoiceMenu)
// — Soul Ledger/Conduit Ascendant/Level 15's stat-or-element pick, and
// Hadrian's recruit/decline offer. Unlike shopMode/jobMode there's no
// button that "enters" this — it's auto-detected from state.flags every
// render, the same way combat itself is, since these arise as a side
// effect of leveling or winning a fight rather than a deliberate typed
// command. The in-combat version of this same data is prepended into
// buildCombatMenu instead (combat.js) rather than shown here, so this
// only ever appears outside a fight.
function renderChoiceMenu() {
  const inCombat = bootStage === "playing" && !!(state && state.combat);
  const options = bootStage === "playing" && state && !inCombat ? buildChoiceMenu(state) : null;
  choiceMenuEl.hidden = !options || activeTab !== "story";
  choiceMenuEl.innerHTML = "";
  if (!options) {
    return;
  }
  options.forEach((opt) => {
    if (opt.heading) {
      const h = document.createElement("p");
      h.className = "shop-heading";
      h.textContent = opt.heading;
      choiceMenuEl.appendChild(h);
      return;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "combat-menu-btn";
    btn.textContent = opt.label;
    btn.addEventListener("click", () => runCommand(opt.command, opt.label));
    choiceMenuEl.appendChild(btn);
  });
}

// Menu-driven base actions (see engine/parser.js's buildLocationMenu) —
// travel/explore/talk/rest/sleep/heal/shop-entry as buttons. Unlike
// combat/shop, this is ADDITIVE: it never touches form.hidden or
// input.disabled itself, since plenty of systems (equip, quests,
// sanctuary, tactics, give/reclaim, save, ...) have no menu equivalent
// yet and still need the typed input reachable underneath. Hidden
// entirely whenever combat, the shop/job menu, or a pending choice has
// taken the input over.
// Collapse state for the location menu's own headings (district, Travel,
// Actions, Reference, ...), keyed by each heading's stable `id` — a
// district name repeats verbatim every time this same city is visited,
// so a player's fold/unfold choice sticks across renders and return
// visits rather than resetting every command. Stores only the ids whose
// collapsed state has been TOGGLED away from that heading's own
// defaultCollapsed (parser.js's buildLocationMenu) — see
// isSectionCollapsed below for how the two combine.
const collapsedOverrides = new Set();
function isSectionCollapsed(opt) {
  const isDefaultCollapsed = !!opt.defaultCollapsed;
  return collapsedOverrides.has(opt.id) ? !isDefaultCollapsed : isDefaultCollapsed;
}

// A self-contained collapsible section for menus with a small, fixed set
// of named groups (shop's Buy/Sell) rather than buildLocationMenu's own
// flat, dynamically-grouped array — same collapsedOverrides Set and
// heading style, just appended directly under `container` instead of
// woven into a bigger forEach. `buildBtn(item)` returns one button
// element per item; re-renders everything via renderModals() on toggle
// since a click here could be coming from any one of several menus.
function appendCollapsibleSection(container, id, headingText, items, buildBtn, defaultCollapsed) {
  const collapsed = isSectionCollapsed({ id, defaultCollapsed });
  const h = document.createElement("p");
  h.className = "shop-heading location-heading";
  h.textContent = `${collapsed ? "▸" : "▾"} ${headingText}`;
  h.addEventListener("click", () => {
    if (collapsedOverrides.has(id)) collapsedOverrides.delete(id);
    else collapsedOverrides.add(id);
    renderModals();
  });
  container.appendChild(h);
  if (collapsed) return;
  items.forEach((item) => container.appendChild(buildBtn(item)));
}

function renderLocationMenu() {
  const show = bootStage === "playing" && !!state && !state.combat && !shopMode && !jobMode && !buildChoiceMenu(state);
  locationMenuEl.hidden = !show || activeTab !== "story";
  locationMenuEl.innerHTML = "";
  if (!show) return;
  let hiddenSectionId = null;
  buildLocationMenu(state).forEach((opt) => {
    if (opt.heading) {
      const collapsed = isSectionCollapsed(opt);
      hiddenSectionId = collapsed ? opt.id : null;
      const h = document.createElement("p");
      h.className = "shop-heading location-heading";
      h.textContent = `${collapsed ? "▸" : "▾"} ${opt.heading}`;
      h.addEventListener("click", () => {
        if (collapsedOverrides.has(opt.id)) collapsedOverrides.delete(opt.id);
        else collapsedOverrides.add(opt.id);
        renderLocationMenu();
      });
      locationMenuEl.appendChild(h);
      return;
    }
    // Every button belongs to whichever heading most recently rendered —
    // skip it entirely while that heading's section is collapsed.
    if (hiddenSectionId) return;
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
  renderJobMenu();
  renderChoiceMenu();
  renderLocationMenu();
  syncInputEnabled();
}

// Whether the input box should currently be off-limits to typing — true
// during combat, true while the job-board menu is showing, true while
// shop buttons are showing (but NOT while pendingBuy's quantity prompt
// is up, which is the one approved moment), and true while a stand-alone
// pending-choice menu is up (never true for the in-combat version of
// that same choice, which is just more combat-menu buttons).
function inputBlocked() {
  const inCombat = bootStage === "playing" && !!(state && state.combat);
  const inShopMenu = bootStage === "playing" && shopMode && !pendingBuy;
  const inJobMenu = bootStage === "playing" && jobMode;
  const inChoiceMenu = bootStage === "playing" && !inCombat && !!(state && buildChoiceMenu(state));
  return inCombat || inShopMenu || inJobMenu || inChoiceMenu;
}

// Every button handler that isn't routed through runCommand (combat's own
// buttons are — shop's aren't, per renderShopMenu's header comment) still
// has to leave the input box in the right enabled/focused state
// afterward, exactly like runCommand's own finally block does.
// The single source of truth for form.hidden/input.disabled/
// input.placeholder — every render*Menu function used to set form.hidden
// independently in its own "not applicable" branch, which meant whichever
// of shop/job/choice was evaluated LAST in renderModals always won,
// silently re-showing the form out from under an EARLIER modal that had
// correctly hidden it (shop's own main view, in particular, since job and
// choice both run after it and reset form.hidden=false whenever THEY
// don't apply — true whenever you're just browsing the shop). Computed
// once here instead, from the same state inputBlocked() already reads.
function syncInputEnabled() {
  const blocked = inputBlocked();
  form.hidden = blocked;
  input.placeholder = shopMode && pendingBuy ? `how many? (1-${pendingBuy.remaining})` : DEFAULT_INPUT_PLACEHOLDER;
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
  // combat/shop/job/choice/location are only ever meant to be shown
  // alongside the Story log — without this, they'd stay visible (renderModals
  // is only ever triggered by game actions, not tab clicks) floating below
  // whichever panel just got switched to.
  renderModals();
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
      // Detect "shop"/"board"/"contracts" (or a synonym — "store"/
      // "market"/"jobs"/...) the same way handleInput itself resolves
      // the verb, so entering shop/job mode matches exactly whatever
      // cmdShop/cmdBoard/cmdContracts was actually about to do.
      const words = commandText.trim().toLowerCase().split(/\s+/);
      const verb = resolveVerb(words[0], words.length === 1);
      const lines = await handleInput(commandText, state);
      printLines(lines);
      if (verb === "shop" && !state.combat && buildShopMenu(state)) {
        shopMode = true;
      }
      if ((verb === "board" || verb === "contracts") && !state.combat && buildJobsMenu(state)) {
        jobMode = true;
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
