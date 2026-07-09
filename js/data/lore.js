/*
 * FRAGMENTA — Lore & Narrative Content
 * Condensed from the Master World Reference. Used both for the in-game
 * `lore`/`codex` command and to seed the keyword-based generative fallback
 * (see engine/generator.js).
 */

const INTRO_TEXT = `
Before there was anything, there was only the Idea — paradoxical, alone,
complete yet fractured. It tore itself into thirteen faces and became the
Thirteen-Headed God. The First Head ruled the other twelve by force, and
together they forged the Spheres of Creation: the world, and everything in
it. When the First Head began to consume rather than rule, the other twelve
poured all their power into its horn until it shattered — not into matter,
but into concept. Ideas. Memories. Timelines flung across the world.

The First Head died. The Twelve fled into mortal hosts and were reborn as
the Pantheon — survivors, not siblings, of a god they had murdered together.

The shattered pieces of that horn are still out there. The world calls them
Fragmenta. They do not wake unless found — and they answer to whoever finds
them.

You do not know any of this yet. You know only that you have a name, a
handful of coin, and a road in front of you.
`.trim();

const NATION_INTRO_HOOKS = {
  sanguivorum:
    "You start in Sanguivorum, the Empire of the Meadows — twelve cities, twelve Legions, five hundred seventy years of open-plains order. A citizen is a tool that knows itself, they say. You've never been sure which tool you are.",
  vaeloris:
    "You start in Vaeloris, beneath the endless forest canopy that answers first to the elves, second to the Arbor, and never to outsiders. Elf, lizardfolk, and dragonborn share an uneasy peace here that has held for longer than it has any right to.",
  sahrimor:
    "You start in Sahrimor, the Desert Commercial Empire, built around a lake that should not exist where it does. Everything here is for sale, including the water, especially the water.",
  thraekor:
    "You start in Thraekor, the Ash Confederation, dwarven clanholds dug into a mountain range that is still, technically, erupting. What remains after everything burns — that's the only principle anyone here trusts.",
  norrvael:
    "You start on Norrvael, the Isle of Silence and Drakes, hidden behind a Mist that doesn't behave like weather. Something old sleeps under the mountains, and lately the drakes have started listening for it.",
};

const CODEX = {
  cosmology: {
    title: "The Shattering",
    text: `Before existence there was only the Idea, which tore itself into the
Thirteen-Headed God. The First Head dominated the rest and, under its
tyranny, the Thirteen forged the Spheres of Creation — Light/Shadow,
Life/Death, War/Peace, Knowledge/Mystery, Dream/Form, Growth/Ruin,
Time/Timelessness, Magic/Void. When the First Head began consuming rather
than ruling, the other twelve overloaded its horn. It shattered into
concept, not matter — the First Head died, "erased yet screaming, a
paradox undone." Its skull, with thirteen horns (one shattered to the
root), lies buried beneath the Kabal Tower in a chamber called the
Sepulcher. It is not gone. Just waiting. Remembering in pieces. And
someday — reassembling.

The Twelve who survived fled into mortal hosts and were reborn as the
Pantheon — not siblings, not allies, survivors of a god they murdered
together.

The scattered pieces of the shattered horn are the Fragmenta: Fragmenta
Majoris (catastrophic, god-detectable), Fragmenta Minoris (corrupts
institutions from within), and Fragmenta Motus (dust-fine, invisible to
gods, nudging small luck and talent). They never seek each other out —
each believes itself the center of things — but they fuse instantly and
irreversibly if brought together, and fusion is always noticed by
something that shouldn't be watching.`,
  },
  kabal: {
    title: "The Gods' Hand Kabal",
    text: `A supranational magical authority ruled by the immortal Archmagi
Primus and the Five Fingers: Secundus (battle master), Tertius/Dûrinne
Stonebrow (diplomat, cannot see her own true face), Quartus (beloved
public healer, secretly runs the Garden of Remade Souls), and Quintus
(dragonborn teleportation master, has glimpsed apocalyptic futures).
The Kabal enforces the Three Laws of Magic, funds itself through mage
registration, a ten-percent Mage Tithe, and bridge tolls, and designates
rogue mages "Bruises" — killable on sight. Its Tower rises a thousand
feet of obsidian from the center of the continent, at the Golden Tear.
What almost no one knows: Primus carries a fragment of the Thirteenth
inside his own body, and has spent centuries — including engineering the
end of the Great Mage War and annihilating his own homeland to do it —
gathering the pieces of a dead god toward its resurrection. He believes
he will ascend. The god he's rebuilding intends to wear him instead.`,
  },
  magic: {
    title: "The Thirteen Rivers",
    text: `All magic flows from thirteen rivers beneath the world: the First
River (the Thirteenth's spilled blood, sourceless and moral-less) and
twelve Divine Rivers, one per Pantheon god. Mages cannot touch a river
directly — they use a Conduit, a personal anchor, which sorts them into
one of three Paths. Study (Incisori): a built anchor, slow and stable,
the Kabal's preferred path. Faith (Offerendi): belief-based, volatile,
can spike under duress. Nature (Germini): a found natural anchor, tied
to the environment, the caster's personality drifting toward their river
over time. Overreach a spell and the river may simply complete it anyway
— using the caster as the remaining material.`,
  },
  sanguivorum: {
    title: "Sanguivorum — Empire of the Meadows",
    text: NATIONS.sanguivorum.blurb + `\n\nRuled by Imperator Civis Alastair through a tiered Senate. Twelve cities, twelve Legions (Ferratum, Ingenum, Impetum, Agilum). Currently fighting a fifteen-year stalemated Desert War against Sahrimor, and a generations-long cold war against Vaeloris.`,
  },
  vaeloris: {
    title: "Vaeloris — The Ancient Forest & the Swamp Hegemony",
    text: NATIONS.vaeloris.blurb + `\n\nRuled by Sylvorn Vaelithar and the Witnessed — twelve oracle-mages secretly trained by the Kabal's Tertius. The Rooted Legion (Thornwatch archers, Rootwall, Gargantua Riders) defends the forest; the swamp keeps its own Heart Guard and its own secrets.`,
  },
  sahrimor: {
    title: "Sahrimor — The Desert Commercial Empire",
    text: NATIONS.sahrimor.blurb + `\n\nRuled by the Merchant King, currently Salutin Seraphin, through three monopolies: Water Law, Trade Legitimacy, and the sanctioned-violence mechanic called the Unbound. Home to the Mugamiir Safor adventuring guild.`,
  },
  thraekor: {
    title: "Thraekor — The Ash Confederation",
    text: NATIONS.thraekor.blurb + `\n\nRuled by the Stillwarden, currently the failing Khar-Sage Aelthrak, always chosen from Clan Aethrak through a rigged Ritual Vote. Rebuilt from Dar-Rakvantim, a dwarf-dragonborn empire destroyed when a cult triggered the volcano that buried it.`,
  },
  norrvael: {
    title: "Norrvael — The Isle of Silence and Drakes",
    text: NATIONS.norrvael.blurb + `\n\nRuled by House Dravenkov, currently Empress Violetta Dravenkov, bonded to the drake Lightning's Rend. Enforced by the masked Silver Cloaks; defended by the drake-knight Storm Riders. Something ancient sleeps beneath the island, and it is not as asleep as it was a generation ago.`,
  },
  languages: {
    title: "The Old Tongues",
    text: `Two dead languages survive in fragments. Vaur'eth — soft, breath-shaped,
oral, the oldest language on the continent, spoken by the Great Lizard of
Drath Vorrumborrar and carried, compressed, in names like Vraul (once
Voraul, "blood-ember"). Keth-Rakar — hard, carved, monumental, the Old
Tongue of Dar-Rakvantim, meant to survive being chiseled into stone. The
two share no root and sound nothing alike. Where they cross — rarely,
and only in the old contact zone — they produce words like Skarr-Daun,
"iron given life."`,
  },
  // Only surfaced in the `lore` topic list for mages (isMage) — a small,
  // concrete reward for choosing a mage background rather than just flavor.
  inner_kabal: {
    title: "What the Novitiates Whisper",
    requires: "isMage",
    text: `Nothing official. Just the kind of thing you hear in a stairwell at
the wrong hour: that Primus was there before the Kabal was anything, that
the Tower's foundations are older than the five nations built around it,
that the Fingers don't entirely trust each other, and that somewhere
below the Sepulcher something is being kept, not stored. Registered mages
learn not to ask a second time when a senior Adept changes the subject.
Unregistered ones learn not to ask at all — or they don't get the chance
to ask twice.`,
  },
};

// World-reactivity flavor: how a place responds to your reputation there,
// keyed by BACKGROUNDS[].reputation values. Picked at random in cmdLook /
// cmdTalk when reputation !== "neutral" for the current nation.
const REPUTATION_FLAVOR = {
  friendly: [
    "A few people recognize what you are, and nod like it means something here.",
    "You're not a stranger in this place, whatever else you are.",
    "Someone addresses you like a countryman before you've said a word.",
  ],
  cold: [
    "Conversation doesn't stop when you pass, but it does thin out.",
    "You get the kind of polite that isn't actually friendly.",
    "A couple of long looks follow you that you pretend not to notice.",
  ],
  hostile: [
    "More than one hand drifts toward a weapon and then, deliberately, away.",
    "You are not welcome here, and no one is pretending otherwise.",
    "Someone is already deciding whether it's worth the trouble of reporting you.",
  ],
};

// The Bruise's central pressure mechanic: hunted wherever the Kabal's reach
// is strongest. See parser.js checkKabalHunt().
const KABAL_HUNT_LINES = [
  "A patrol falls into step behind you — too neat, too quiet, Kabal-trained.",
  "Someone in a grey Kabal-sanctioned coat is asking after 'an unregistered practitioner' two streets back.",
  "A registration checkpoint has gone up since you were last through here, and you weren't planning on stopping for it.",
];

const QUEST_HOOKS = [
  {
    id: "fragmenta_rumor",
    trigger: "start",
    text: "Word travels slowly but it travels: someone, somewhere, has found a piece of something that shouldn't exist. People are calling it a Fragmenta shard. Whoever gets to it first will not be the same person afterward.",
  },
  {
    id: "kabal_watching",
    trigger: "kabal_tower",
    text: "Standing this close to the Tower, you understand for the first time why people lower their voices near it without being told to.",
  },
];
