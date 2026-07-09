/*
 * FRAGMENTA — Bootstrap
 */

const logEl = document.getElementById("log");
const form = document.getElementById("input-form");
const input = document.getElementById("input");

let state = null;
let bootStage = "ask_load"; // ask_load -> ask_name -> ask_background -> playing
let pendingName = "";

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

function beginCharacter(bgKey, name) {
  state = new GameState();
  state.playerName = name;
  state.applyBackground(bgKey);
  state.visit(state.location);
  bootStage = "playing";

  printLines(INTRO_TEXT.split("\n\n"));
  print("");
  print(BACKGROUNDS[bgKey].intro);
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
    beginCharacter(key, pendingName);
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
    input.disabled = gameOver;
    if (!gameOver) input.focus();
  }
});

boot();
