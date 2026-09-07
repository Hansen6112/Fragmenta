/*
 * FRAGMENTA — Bootstrap
 */

const logEl = document.getElementById("log");
const invPanel = document.getElementById("inventory-panel");
const equipPanel = document.getElementById("equipment-panel");
const partyPanel = document.getElementById("party-panel");
const lorePanel = document.getElementById("lore-panel");
const journalPanel = document.getElementById("journal-panel");
const bootMenuEl = document.getElementById("boot-menu");
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
// Which panel (if any) each equipable inventory item currently has open —
// keyed by item name, value one of "open" (description + Equip/Drop/
// Dismantle), "equip" (who to equip to), "drop"/"dismantle" (their
// confirm steps). Absent = collapsed. Consumable/ritual items don't use
// this at all — they keep their plain inline Use/Drop buttons.
let inventoryPanelState = new Map();
// Which ally equip-slot pickers are currently open on the Party tab —
// keyed by "<ally name>::<slot>". Presence in the set means open;
// renderAllyEquipmentList lists whatever's currently in the shared
// inventory that fits that slot when it is.
let allyEquipPickerOpen = new Set();
// Lore tab drill-down (main.js's renderLore): null/null shows the four
// category buttons; a category id with no topic shows that category's
// topic list; both set shows one topic's full text. Persists across tab
// switches, same as inventoryPanelState/allyEquipPickerOpen above.
let loreCategory = null;
let loreTopic = null;

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

// Item names are stored as plain repeated strings (see cmdEquip);
// every item panel aggregates matching names into a count instead of
// listing duplicates as separate rows. `actionsForItem`, when given,
// appends one button per {label, command} it returns for that item —
// clicking one runs the exact command string drop/give/use already
// accept from typed input (same command-string reuse as combat's
// buildCombatMenu), so no parser changes were needed for this phase.
// Equipable gear and consumables instead get the click-to-expand
// accordion built by buildInventoryItemPanel — see isExpandableItem below.
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
    const expandable = isExpandableItem(item);
    const row = document.createElement("div");
    row.className = "inv-row-main";
    const name = document.createElement("span");
    name.textContent = (expandable ? (inventoryPanelState.has(item) ? "▾ " : "▸ ") : "") + formatItemLine(item);
    row.appendChild(name);
    if (count > 1) {
      const badge = document.createElement("span");
      badge.className = "inv-count";
      badge.textContent = `x${count}`;
      row.appendChild(badge);
    }
    li.appendChild(row);

    if (expandable) {
      row.classList.add("location-heading");
      row.addEventListener("click", () => {
        if (inventoryPanelState.has(item)) inventoryPanelState.delete(item);
        else inventoryPanelState.set(item, "open");
        renderActiveTab();
      });
      const panelState = inventoryPanelState.get(item);
      if (panelState) li.appendChild(buildInventoryItemPanel(item, panelState));
    } else {
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
    }
    list.appendChild(li);
  }
  panel.appendChild(list);
}

// Real gear only (cmdEquip/cmdGive/cmdDismantle all reject consumable/
// ritual slots the same way).
function isEquipableItem(item) {
  const def = getItemDef(item);
  const slot = def ? def.slot : inferEquipSlot(item);
  return !!slot && slot !== "consumable" && EQUIP_SLOTS.includes(slot);
}

function isConsumableItem(item) {
  const def = getItemDef(item);
  return !!def && def.slot === "consumable";
}

// Equipable gear and consumables both get the click-to-expand panel;
// anything else (ritual items, unrecognized loot with no slot at all)
// keeps the plain inline Drop-only row via actionsForInventoryItem.
function isExpandableItem(item) {
  return isEquipableItem(item) || isConsumableItem(item);
}

// Only reached by items isExpandableItem excludes — ritual gear and
// anything unrecognized. Drop is the only thing left to do with them.
function actionsForInventoryItem(item) {
  return [{ label: "Drop", command: `drop ${item}` }];
}

// Runs a real command (same string typed input would accept) from inside
// the expanded item panel, then collapses it back to closed — the item's
// stack count (or existence) just changed, so there's nothing sensible
// left to keep the panel open on.
async function resolveInventoryAction(command, echoText, item) {
  await runCommand(command, echoText);
  inventoryPanelState.delete(item);
  renderActiveTab();
}

// The click-to-expand panel under an equipable/consumable inventory row —
// one of several views keyed by inventoryPanelState's value for this
// item: "open" (description + the top-level choices for this item's
// kind), "equip"/"use" (who — equip or use-on picker, gear vs.
// consumable respectively), "drop"/"dismantle" (their irreversible-
// action confirmations).
function buildInventoryItemPanel(item, panelState) {
  const box = document.createElement("div");
  box.className = "inv-item-panel";

  const backTo = (next) => {
    inventoryPanelState.set(item, next);
    renderActiveTab();
  };

  if (panelState === "use") {
    const heading = document.createElement("p");
    heading.textContent = "Use on whom?";
    box.appendChild(heading);
    const you = document.createElement("button");
    you.type = "button";
    you.className = "combat-menu-btn";
    you.textContent = "You";
    you.addEventListener("click", () => resolveInventoryAction(`use ${item}`, `Use ${item}`, item));
    box.appendChild(you);
    state.party.filter((a) => a.alive).forEach((a) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "combat-menu-btn";
      btn.textContent = a.name;
      btn.addEventListener("click", () => resolveInventoryAction(`use ${item} on ${a.name}`, `Use ${item} on ${a.name}`, item));
      box.appendChild(btn);
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "combat-menu-btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => backTo("open"));
    box.appendChild(cancel);
    return box;
  }

  if (panelState === "equip") {
    const heading = document.createElement("p");
    heading.textContent = "Equip to whom?";
    box.appendChild(heading);
    const you = document.createElement("button");
    you.type = "button";
    you.className = "combat-menu-btn";
    you.textContent = "You";
    you.addEventListener("click", () => resolveInventoryAction(`equip ${item}`, `Equip ${item} to yourself`, item));
    box.appendChild(you);
    state.party.filter((a) => a.alive).forEach((a) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "combat-menu-btn";
      btn.textContent = a.name;
      btn.addEventListener("click", () => resolveInventoryAction(`give ${item} to ${a.name}`, `Equip ${item} to ${a.name}`, item));
      box.appendChild(btn);
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "combat-menu-btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => backTo("open"));
    box.appendChild(cancel);
    return box;
  }

  if (panelState === "drop") {
    const warning = document.createElement("p");
    warning.className = "inv-warning";
    warning.textContent = "If dropped, this item cannot be recovered.";
    box.appendChild(warning);
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "combat-menu-btn flee";
    confirm.textContent = "Confirm Drop";
    confirm.addEventListener("click", () => resolveInventoryAction(`drop ${item}`, `Drop ${item}`, item));
    box.appendChild(confirm);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "combat-menu-btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => backTo("open"));
    box.appendChild(cancel);
    return box;
  }

  if (panelState === "dismantle") {
    const warning = document.createElement("p");
    warning.className = "inv-warning";
    warning.textContent = "This cannot be reversed.";
    box.appendChild(warning);
    const yield_ = document.createElement("p");
    yield_.textContent = `You'll salvage: ${dismantleComponents(item).join(", ")}.`;
    box.appendChild(yield_);
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "combat-menu-btn flee";
    confirm.textContent = "Confirm Dismantle";
    confirm.addEventListener("click", () => resolveInventoryAction(`dismantle ${item}`, `Dismantle ${item}`, item));
    box.appendChild(confirm);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "combat-menu-btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => backTo("open"));
    box.appendChild(cancel);
    return box;
  }

  // "open" — description plus this item's top-level choices: consumables
  // get Use/Drop, equipable gear keeps Equip/Drop/Dismantle.
  const desc = document.createElement("p");
  desc.textContent = itemDescription(item);
  box.appendChild(desc);
  if (isConsumableItem(item)) {
    const useBtn = document.createElement("button");
    useBtn.type = "button";
    useBtn.className = "combat-menu-btn";
    useBtn.textContent = "Use";
    useBtn.addEventListener("click", () => backTo("use"));
    box.appendChild(useBtn);
  } else {
    const equipBtn = document.createElement("button");
    equipBtn.type = "button";
    equipBtn.className = "combat-menu-btn";
    equipBtn.textContent = "Equip";
    equipBtn.addEventListener("click", () => backTo("equip"));
    box.appendChild(equipBtn);
  }
  const dropBtn = document.createElement("button");
  dropBtn.type = "button";
  dropBtn.className = "combat-menu-btn";
  dropBtn.textContent = "Drop";
  dropBtn.addEventListener("click", () => backTo("drop"));
  box.appendChild(dropBtn);
  if (!isConsumableItem(item)) {
    const dismantleBtn = document.createElement("button");
    dismantleBtn.type = "button";
    dismantleBtn.className = "combat-menu-btn";
    dismantleBtn.textContent = "Dismantle";
    dismantleBtn.addEventListener("click", () => backTo("dismantle"));
    box.appendChild(dismantleBtn);
  }
  return box;
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

// Distinct (deduped) carried items that fit a given equip slot — what an
// ally's "Equip" picker for that slot has to offer. Same slot resolution
// (registry first, inferEquipSlot fallback) actionsForInventoryItem etc.
// already use.
function eligibleInventoryItemsForSlot(slot) {
  const seen = new Set();
  const out = [];
  for (const item of state.inventory) {
    if (seen.has(item)) continue;
    const def = getItemDef(item);
    const itemSlot = def ? def.slot : inferEquipSlot(item);
    if (itemSlot !== slot) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

// Per-ally equipment breakdown for the Party tab — same fixed-slot-row
// shape as the player's own renderEquipment, but each row also gets an
// Equip button that opens a picker of eligible items straight from the
// shared inventory (clicking one runs the same `give <item> to <ally>`
// cmdGive already accepts), alongside Unequip (`reclaim <item> from
// <ally>`, cmdReclaim's existing command). This is the only place gear
// ever moves onto/off of an ally now — items don't have a separate
// per-ally stash of their own, just what's equipped vs. what's still in
// the shared pool.
function renderAllyEquipmentList(container, ally) {
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
    const filled = slot === "trinkets" ? ally.equipment.trinkets : (ally.equipment[slot] ? [ally.equipment[slot]] : []);
    value.textContent = filled.length ? filled.map(formatItemLine).join("; ") : "(empty)";
    value.className = filled.length ? "equip-slot-value" : "equip-slot-value inv-empty";
    row.appendChild(value);
    li.appendChild(row);

    const actionRow = document.createElement("div");
    actionRow.className = "inv-actions";
    filled.forEach((item) => {
      const unequipLabel = filled.length > 1 ? `Unequip: ${item}` : "Unequip";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "combat-menu-btn";
      btn.textContent = unequipLabel;
      btn.addEventListener("click", () => runCommand(`reclaim ${item} from ${ally.name}`, `${unequipLabel} (${ally.name})`));
      actionRow.appendChild(btn);
    });

    const atCapacity = slot === "trinkets" && ally.equipment.trinkets.length >= EQUIP_SLOT_CAPACITY.trinkets;
    const pickerKey = `${ally.name}::${slot}`;
    if (!atCapacity) {
      const equipBtn = document.createElement("button");
      equipBtn.type = "button";
      equipBtn.className = "combat-menu-btn";
      equipBtn.textContent = "Equip";
      equipBtn.addEventListener("click", () => {
        if (allyEquipPickerOpen.has(pickerKey)) allyEquipPickerOpen.delete(pickerKey);
        else allyEquipPickerOpen.add(pickerKey);
        renderParty();
      });
      actionRow.appendChild(equipBtn);
    }
    if (actionRow.children.length) li.appendChild(actionRow);

    if (allyEquipPickerOpen.has(pickerKey)) {
      const picker = document.createElement("div");
      picker.className = "inv-item-panel";
      const options = eligibleInventoryItemsForSlot(slot);
      if (!options.length) {
        const none = document.createElement("p");
        none.className = "inv-empty";
        none.textContent = `You aren't carrying anything for ${EQUIP_SLOT_LABELS[slot]}.`;
        picker.appendChild(none);
      } else {
        options.forEach((item) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "combat-menu-btn";
          btn.textContent = formatItemLine(item);
          btn.addEventListener("click", async () => {
            await runCommand(`give ${item} to ${ally.name}`, `Equip ${item} to ${ally.name}`);
            allyEquipPickerOpen.delete(pickerKey);
            renderParty();
          });
          picker.appendChild(btn);
        });
      }
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "combat-menu-btn";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => {
        allyEquipPickerOpen.delete(pickerKey);
        renderParty();
      });
      picker.appendChild(cancel);
      li.appendChild(picker);
    }

    list.appendChild(li);
  }
  container.appendChild(list);
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

    renderAllyEquipmentList(card, ally);

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

// The Lore tab (see engine/parser.js's loreCategories): a three-level
// drill-down — categories, then that category's unlocked topics, then
// one topic's full text — mirroring combat's own stage-based menu (top/
// target/attack/item) rather than an expand-in-place accordion, since
// only one topic is ever being read at a time. loreCategory/loreTopic
// (main.js top-level state) track where the player currently is.
function renderLore() {
  lorePanel.innerHTML = "";
  if (!state) {
    const empty = document.createElement("p");
    empty.className = "inv-empty";
    empty.textContent = "Your journey hasn't begun yet.";
    lorePanel.appendChild(empty);
    return;
  }

  const categories = loreCategories(state);

  const backBtn = (onClick) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "combat-menu-btn";
    btn.textContent = "Back";
    btn.addEventListener("click", onClick);
    return btn;
  };

  if (loreCategory) {
    const cat = categories.find((c) => c.id === loreCategory);
    if (!cat) {
      // Stale category id (shouldn't happen — the four are fixed) —
      // fall back to the top level rather than rendering nothing.
      loreCategory = null;
      loreTopic = null;
      renderLore();
      return;
    }

    if (loreTopic) {
      const topic = cat.topics.find((t) => t.key === loreTopic);
      if (!topic) {
        loreTopic = null;
        renderLore();
        return;
      }
      lorePanel.appendChild(backBtn(() => {
        loreTopic = null;
        renderLore();
      }));
      const title = document.createElement("p");
      title.className = "inv-gold";
      title.textContent = topic.title;
      lorePanel.appendChild(title);
      const text = document.createElement("p");
      text.textContent = topic.text;
      lorePanel.appendChild(text);
      return;
    }

    lorePanel.appendChild(backBtn(() => {
      loreCategory = null;
      renderLore();
    }));
    const heading = document.createElement("p");
    heading.className = "inv-gold";
    heading.textContent = cat.label;
    lorePanel.appendChild(heading);
    if (!cat.topics.length) {
      const empty = document.createElement("p");
      empty.className = "inv-empty";
      empty.textContent = "Nothing here yet.";
      lorePanel.appendChild(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "inv-actions";
    cat.topics.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "combat-menu-btn";
      btn.textContent = t.title;
      btn.addEventListener("click", () => {
        loreTopic = t.key;
        renderLore();
      });
      list.appendChild(btn);
    });
    lorePanel.appendChild(list);
    return;
  }

  // Top level: one button per category, count included so it's obvious
  // at a glance whether there's anything new to read.
  const heading = document.createElement("p");
  heading.className = "inv-gold";
  heading.textContent = "Lore & Codex";
  lorePanel.appendChild(heading);
  const list = document.createElement("div");
  list.className = "inv-actions";
  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "combat-menu-btn";
    btn.textContent = `${cat.label} (${cat.topics.length})`;
    btn.addEventListener("click", () => {
      loreCategory = cat.id;
      renderLore();
    });
    list.appendChild(btn);
  });
  lorePanel.appendChild(list);
}

// Journal tab: a flat list of open quest threads and their next step —
// see engine/parser.js's journalEntries for what's included and why
// (job-board contracts plus the two companion quest arcs; blocking
// choice-menu prompts and ambient QUEST_HOOKS flavor are deliberately
// left out).
function renderJournal() {
  journalPanel.innerHTML = "";
  if (!state) {
    const empty = document.createElement("p");
    empty.className = "inv-empty";
    empty.textContent = "Your journey hasn't begun yet.";
    journalPanel.appendChild(empty);
    return;
  }

  const heading = document.createElement("p");
  heading.className = "inv-gold";
  heading.textContent = "Journal";
  journalPanel.appendChild(heading);

  const entries = journalEntries(state);
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "inv-empty";
    empty.textContent = "No active quests. Take on some work or keep traveling with your party — something will turn up.";
    journalPanel.appendChild(empty);
    return;
  }

  let lastHeading = null;
  entries.forEach((e) => {
    if (e.heading !== lastHeading) {
      lastHeading = e.heading;
      const sub = document.createElement("p");
      sub.className = "inv-gold";
      sub.textContent = e.heading;
      journalPanel.appendChild(sub);
    }
    const card = document.createElement("div");
    card.className = "inv-item-panel";
    const title = document.createElement("strong");
    title.textContent = e.title;
    card.appendChild(title);
    const detail = document.createElement("span");
    detail.textContent = e.detail;
    card.appendChild(detail);
    journalPanel.appendChild(card);
  });
}

function renderActiveTab() {
  if (activeTab === "inventory") renderInventory();
  if (activeTab === "equipment") renderEquipment();
  if (activeTab === "party") renderParty();
  if (activeTab === "lore") renderLore();
  if (activeTab === "journal") renderJournal();
}

// Menu-driven character creation — the one part of the game that never
// got converted when everything else did, since it all happens before
// bootStage reaches "playing" (every other render* function here no-ops
// during boot). "Continue previous journey?", background, and element
// are all a fixed choice from a fixed list, so each gets one button per
// option, same command-string-reuse pattern as everywhere else: a click
// just runs the exact text handleBootInput already parses (a plain
// "yes"/"no", or the background/element's own key, which its fuzzy
// match already accepts verbatim). Naming stays typed — there's no
// fixed list of names to offer buttons for.
function renderBootMenu() {
  const show = bootStage === "ask_load" || bootStage === "ask_background" || bootStage === "ask_element";
  bootMenuEl.hidden = !show || activeTab !== "story";
  bootMenuEl.innerHTML = "";
  if (!show) return;

  if (bootStage === "ask_load") {
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "combat-menu-btn";
    yes.textContent = "Continue Journey";
    yes.addEventListener("click", () => runCommand("yes", "Continue Journey"));
    bootMenuEl.appendChild(yes);
    const no = document.createElement("button");
    no.type = "button";
    no.className = "combat-menu-btn flee";
    no.textContent = "Start Fresh";
    no.addEventListener("click", () => runCommand("no", "Start Fresh"));
    bootMenuEl.appendChild(no);
    return;
  }

  if (bootStage === "ask_background") {
    Object.entries(BACKGROUNDS).forEach(([key, bg]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "combat-menu-btn";
      btn.textContent = `${bg.name} — ${bg.tagline}`;
      btn.addEventListener("click", () => runCommand(key, bg.name));
      bootMenuEl.appendChild(btn);
    });
    return;
  }

  if (bootStage === "ask_element") {
    Object.entries(ELEMENTS).forEach(([key, el]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "combat-menu-btn";
      btn.textContent = `${el.name} — ${el.description}`;
      btn.addEventListener("click", () => runCommand(key, el.name));
      bootMenuEl.appendChild(btn);
    });
    return;
  }
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
  renderBootMenu();
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
// is up, which is the one approved moment), true while a stand-alone
// pending-choice menu is up (never true for the in-combat version of
// that same choice, which is just more combat-menu buttons), and true
// for the three boot stages with a fixed-list button menu (load-prompt,
// background, element) — but never for ask_name, the other approved
// free-text moment alongside the shop's quantity prompt.
function inputBlocked() {
  const inCombat = bootStage === "playing" && !!(state && state.combat);
  const inShopMenu = bootStage === "playing" && shopMode && !pendingBuy;
  const inJobMenu = bootStage === "playing" && jobMode;
  const inChoiceMenu = bootStage === "playing" && !inCombat && !!(state && buildChoiceMenu(state));
  const inBootMenu = bootStage === "ask_load" || bootStage === "ask_background" || bootStage === "ask_element";
  return inCombat || inShopMenu || inJobMenu || inChoiceMenu || inBootMenu;
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
  lorePanel.hidden = tab !== "lore";
  journalPanel.hidden = tab !== "journal";
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
    print("A previous journey was found. Continue it?", "system");
  } else {
    startNewGame();
  }
  // Every other stage transition happens inside handleBootInput, which
  // runs from runCommand's own finally block (renderActiveTab/
  // renderModals) — but boot() itself runs once, before the player has
  // typed anything at all, so the very first screen needs its own call
  // to actually show the ask_load buttons (or nothing yet, for ask_name).
  renderModals();
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
    print("(pick one below)", "system");
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
      print("(pick one below — you can open a second element later, at level 15)", "system");
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
