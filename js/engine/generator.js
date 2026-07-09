/*
 * FRAGMENTA — Hybrid Generative Layer
 *
 * This is the "open choice" half of the hybrid design. When the parser
 * doesn't recognize a command as a known verb, instead of just failing it
 * routes here: we scan the input for keywords against the world's lore,
 * bestiary, and locations, and stitch together a contextual, in-voice
 * response using the source material rather than a canned error.
 *
 * ---- FUTURE LLM HOOK ----
 * This is deliberately structured so a real language model can be dropped
 * in later without touching the parser: `generateOpenResponse` is async,
 * and `callLLM()` below is the single seam to wire up. Today it's a stub
 * that returns null (disabled), so `generateOpenResponse` always falls
 * back to the local keyword-based generator. To go live: implement
 * `callLLM` to POST to your inference endpoint with the built prompt
 * context, flip LLM_CONFIG.enabled, and the rest of the engine needs no
 * changes — it already awaits this function and treats a non-null
 * response as authoritative narrative text.
 */

const LLM_CONFIG = {
  enabled: false,
  endpoint: null, // e.g. "/api/fragmenta-narrate"
};

async function callLLM(prompt, context) {
  if (!LLM_CONFIG.enabled || !LLM_CONFIG.endpoint) return null;
  try {
    const res = await fetch(LLM_CONFIG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.text || null;
  } catch (e) {
    return null;
  }
}

function buildPromptContext(state) {
  const loc = state.currentLocation();
  const nation = getNation(state.nation);
  return {
    location: loc.name,
    nation: nation.name,
    day: state.day,
    health: state.health,
    inventory: state.inventory,
  };
}

async function generateOpenResponse(input, state) {
  const context = buildPromptContext(state);

  // Seam: try the real model first (no-op until LLM_CONFIG.enabled is true)
  const llmText = await callLLM(input, context);
  if (llmText) return [llmText];

  return localGenerate(input, state);
}

// Extra keywords that should surface a codex topic even when they don't
// literally appear in the topic key or title (e.g. "fragmenta" -> cosmology).
const TOPIC_ALIASES = {
  cosmology: ["fragmenta", "shard", "shattering", "thirteenth", "pantheon", "god", "gods"],
  kabal: ["primus", "kabal tower", "fingers", "archmagi", "tithe", "bruise"],
  magic: ["conduit", "river", "rivers", "path", "mage", "spell"],
  languages: ["vauret", "kethrakar", "vaur'eth", "language", "dead language", "dialect"],
};

function localGenerate(input, state) {
  const q = input.toLowerCase();
  const loc = state.currentLocation();
  const nation = getNation(state.nation);
  const hits = [];

  // 1. Codex keyword matches: the topic key itself (e.g. "kabal") or a
  // curated alias (e.g. "primus" -> kabal). Deliberately does NOT match on
  // title words — several titles start with "The", which would match almost
  // any sentence in English.
  for (const [key, entry] of Object.entries(CODEX)) {
    const aliasHit = (TOPIC_ALIASES[key] || []).some((a) => q.includes(a));
    if (aliasHit || q.includes(key)) {
      hits.push(entry.text.split("\n")[0]);
    }
  }

  // 2. Bestiary keyword matches
  for (const [id, creature] of Object.entries(BESTIARY)) {
    const cname = creature.name.toLowerCase();
    const native = creature.native.toLowerCase();
    if (q.includes(cname) || q.includes(native) || q.includes(id.replace(/_/g, " "))) {
      hits.push(`${creature.name} (${creature.native}): ${creature.description}`);
    }
  }

  // 3. Location keyword matches (other than current)
  for (const [id, l] of Object.entries(LOCATIONS)) {
    if (id === state.location) continue;
    if (q.includes(l.name.toLowerCase())) {
      hits.push(`Of ${l.name}: ${l.description}`);
    }
  }

  if (hits.length > 0) {
    return hits.slice(0, 2);
  }

  // 4. Nothing matched — generate atmospheric filler grounded in the
  //    current location/nation, using the conlang generator so it never
  //    feels like a canned "I don't understand" message.
  const flavorName = generateNameForNation(state.nation);
  const fillers = [
    `You consider it, but nothing here answers to that. A local nearby, someone called ${flavorName}, gives you a look that suggests you should try something else.`,
    `That's not something ${loc.name} has an answer for. The ${nation.name} wind doesn't change its mind either.`,
    `You try, but the world doesn't bend that way here — not yet, anyway. (Type 'help' for what you can do.)`,
    `Nothing happens, though somewhere a person named ${flavorName} would probably have opinions about you trying.`,
  ];
  return [fillers[Math.floor(Math.random() * fillers.length)]];
}
