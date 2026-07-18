/*
 * FRAGMENTA — Hadrian Voric's Personal Quest: "History's Sting"
 * Section 11.2 of the Hadrian Voric Companion Character Sheet, deferred
 * out of the original companion build and implemented here once its
 * prerequisite (the hidden companion relationship meter, engine/jobs.js)
 * existed. Logic lives in engine/hadrianquest.js; this file is dialogue
 * text, the two required NPCs (Astra Sa'Lahru's Revenant and the Bruised
 * Mage — Section 11.6's "Required NPCs", built here for the first time),
 * and the Legendary equipment ascension ("The Bloodbound Champion's
 * Regalia", Section 11.4) and quest-reward trinkets (Section 11.5).
 *
 * The "investigation" (Section 11.2's Narrative Progression: "follows the
 * trail of Hadrian's missing former squadmates from the last known
 * location toward the Black Sands") is condensed here into a single
 * travel step — arriving at the Black Sands (data/world.js) is what
 * triggers the confrontation — rather than a multi-stage clue-following
 * system this codebase has no existing precedent for (compare Kessa's
 * own recruitment quest, engine/parser.js's maybeTalkToKessa: "clear a
 * real fight" stood in for a fuller trial the same way).
 */

const HADRIAN_QUEST = {
  // ---- 25 relationship: foreshadowing only, does not unlock the quest ----
  letter25: [
    `A courier finds Hadrian at camp and hands him a folded letter, sealed with wax gone soft from travel. He reads it twice before he says anything.`,
    `"One of my old unit. Reclusive sort, even for a Ferratum — talked more than once about walking off somewhere no one would follow." He folds the letter back along its crease. "Gone missing, apparently. His neighbors are worried. I'm not, particularly — this is a man who wanted to disappear, and finally has."`,
    `You offer to help look into it anyway. He shakes his head. "Appreciate it. But chasing down a man for the crime of getting what he wanted isn't a kindness. Leave him be."`,
  ],
  // ---- 50 relationship: unlocks the quest ----
  letter50Unlock: [
    `Another courier, another letter — except this time there are eight of them, bound together with a single cord, each in a different hand. Hadrian reads all eight standing in the road before he says a word.`,
    `"Eight men. All mine, once — the unit that brought down Astra Sa'Lahru. Missing, every one, over the better part of a year. I told myself the first was a man getting what he wanted. I can't tell myself that eight times." His jaw sets in a way you haven't seen before. "This isn't coincidence. Someone's hunting what's left of my old command, and I don't yet know why."`,
    `You offer to help him find out. He doesn't hesitate. "Yes. Let's go."`,
  ],
  // ---- Black Sands confrontation ----
  confrontationIntro: [
    `The trail — what little of one eight vanished men left behind — ends the same way every reliable route into Sahrimor's south eventually does: at the edge of the Black Sands, where the cold has no business existing and fewer travelers come back than go in.`,
    `Hadrian doesn't slow down at the tree line, if it can even be called that out here. "Whatever did this, it's close. I can feel it the way you feel a storm before the sky changes."`,
    `The sand ahead is disturbed — dragged, not walked — leading to a lone, robed figure standing over something that used to be human-shaped, and isn't quite anymore. Chitin gleams where skin should be. The figure doesn't turn around.`,
    `"Astra Sa'Lahru," Hadrian says, and for the first time since you've known him, his voice isn't steady. "I killed her twelve years ago. Honorably. In the field. She doesn't belong here."`,
    `The robed figure finally turns. Whatever he was before the Kabal named him a Bruise, there's little left of it now beneath the raw, humming magic holding a dead Akharu general upright by force of will alone. "She belongs to whoever raises her," he says. "That's me, now. And she has work left to finish."`,
  ],
  // ---- Completion ----
  completion: [
    `The Bruised Mage's hold breaks the instant he falls — and Astra Sa'Lahru's Revenant staggers, chitin cracking along seams that were never meant to move again, until whatever unnatural will was driving her simply isn't there anymore.`,
    `Hadrian lowers his maul and crosses to where she's collapsed, kneeling beside a creature he once fought to the death in fair combat and has now, in a different sense, killed twice. "You were the better commander that day," he says, quiet enough that it isn't clear he means for you to hear it. "You deserved to stay dead with that. I'm sorry it took this long to give it back to you."`,
    `Whatever remains of Astra Sa'Lahru finally goes still — properly, permanently this time. The Bruised Mage will raise no one else.`,
    `Hadrian is quiet for a long moment afterward. "Eight men are still gone," he finally says. "That doesn't change. But whatever was going to make a ninth of me — that's finished." He looks steadier than you've seen him since the letters arrived. "My thanks. This was mine to carry, and you carried it with me."`,
  ],
  ascensionFlavor: [
    `Something in Hadrian's bearing settles further as you make camp that night — the same maul, the same sash, but he moves like a man who's finally set down a weight he'd stopped noticing he was carrying. His gear seems to notice too: the crimson sash draws tighter, the plate sits differently on his shoulders, like eleven years of the Ovum and this one closed chapter have finally been allowed to mean the same thing.`,
  ],
};

// ---- Astra Sa'Lahru's Revenant (Required NPC, Section 11.6) ----
// A dynamic (non-BESTIARY) combat template, same convention as
// engine/arena.js's Hadrian duel encounter — a scripted, one-time boss,
// not a random encounter. Undead-faction, matching her death and
// unnatural reanimation; her real name only means anything in context of
// this specific confrontation, so she isn't added to the general undead
// encounter pool.
const ASTRA_SALAHRU_REVENANT = {
  id: "astra_salahru_revenant",
  name: "Astra Sa'Lahru's Revenant",
  native: "Sahrimor (Akharu)",
  level: 14,
  hp: 95,
  atk: 17,
  def: 14,
  spd: 8,
  acc: 12,
  agi: 9,
  dangerClass: "boss",
  spawnRarity: "unique",
  faction: "undead",
  description: "A dead Akharu general's body, held upright and moving by force the Bruised Mage is spending everything he has to maintain. Whatever made her a great commander in life is still in there somewhere, fighting the compulsion as much as she's fighting you.",
  combatNotes: "Twelve years dead, and still moving like she remembers exactly how.",
  friendly: false,
};

// ---- The Bruised Mage (Required NPC, Section 11.6) ----
// "Bruise" is this world's own term (data/lore.js) for a rogue/unregistered
// mage the Kabal has marked killable on sight — the villain's title is
// literal, not invented lore. A necromantic Bruise obsessive enough to
// raise and sustain an Akharu general's corpse for the better part of a
// year, hunting down her killer's old command one by one.
const BRUISED_MAGE = {
  id: "bruised_mage",
  name: "The Bruised Mage",
  native: "Sahrimor",
  level: 14,
  hp: 60,
  atk: 15,
  def: 8,
  spd: 10,
  acc: 13,
  agi: 8,
  dangerClass: "boss",
  spawnRarity: "unique",
  faction: "human",
  description: "Whatever grievance against the Kabal first drove him into hiding has long since curdled into something with no name. Every scrap of magic he has left is spent keeping Astra Sa'Lahru's Revenant standing.",
  combatNotes: "A Bruise obsessive enough to hold a corpse upright by will alone for the better part of a year.",
  friendly: false,
};

// ---- Legendary equipment ascension: "The Bloodbound Champion's Regalia" (Section 11.4) ----
// Every base item's name maps to its ascended replacement — swapped into
// ally.equipment wholesale on quest completion (engine/hadrianquest.js's
// ascendHadrianEquipment) rather than mutating the base ITEM_DEFS entries
// in place, since the base (non-ascended) versions still need to exist
// for players who haven't finished the quest yet. See data/items.js for
// the ascended items' actual stat bonuses.
const HADRIAN_ASCENSION_MAP = {
  mainhand: "Ascended Bloodbound Champion's Maul",
  helmet: "Ascended Bloodbound Champion Helm",
  chest: "Ascended Bloodbound Champion Cuirass",
  gloves: "Ascended Bloodbound Champion Gauntlets",
  boots: "Ascended Bloodbound Champion Boots",
  cloak: "Ascended Crimson Champion's Sash",
};

// ---- Companion Trinkets (Section 11.5) — quest-completion rewards, fill
// both of Hadrian's Trinket slots for the first time. ----
const HADRIAN_QUEST_TRINKETS = ["The Roll of the Ferratum", "Astra Sa'Lahru's Broken Crest"];
