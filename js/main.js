/*
 * FRAGMENTA — Bootstrap
 */

const STARTING_LOCATION = {
  sanguivorum: "zuevaron",
  vaeloris: "the_arbor",
  sahrimor: "sahurim",
  thraekor: "khar_vantr",
  norrvael: "dragenholm",
};

const logEl = document.getElementById("log");
const form = document.getElementById("input-form");
const input = document.getElementById("input");

let state = null;
let bootStage = "ask_load"; // ask_load -> ask_name -> ask_nation -> playing
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

function beginNation(nationKey, name) {
  state = new GameState();
  state.playerName = name;
  state.nation = nationKey;
  state.location = STARTING_LOCATION[nationKey];
  state.visit(state.location);
  bootStage = "playing";

  printLines(INTRO_TEXT.split("\n\n"));
  print("");
  print(NATION_INTRO_HOOKS[nationKey]);
  print("");
  printLines(cmdLook(state));
  print("");
  print("(type 'help' any time to see what you can do)", "system");
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
    bootStage = "ask_nation";
    print(`Well met, ${pendingName}.`, "system");
    print("");
    print("Where does your story begin? Choose a nation:", "system");
    for (const [key, n] of Object.entries(NATIONS)) {
      if (key === "kabal") continue;
      print(`  ${n.name} — ${n.title}`, "system");
    }
    print("(type a nation name)", "system");
    return;
  }
  if (bootStage === "ask_nation") {
    const key = Object.keys(NATIONS).find(
      (k) => k !== "kabal" && (text.toLowerCase().includes(k) || k.includes(text.toLowerCase()) || NATIONS[k].name.toLowerCase().includes(text.toLowerCase()))
    );
    if (!key) {
      print("Not a nation anyone's heard of. Try: Sanguivorum, Vaeloris, Sahrimor, Thraekor, or Norrvael.", "system");
      return;
    }
    beginNation(key, pendingName);
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
